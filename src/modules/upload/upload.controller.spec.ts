import { UploadController } from './upload.controller';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
const sharp = require('sharp');

describe('Persistent KYC uploads', () => {
  let directory: string;
  let controller: UploadController;
  beforeEach(async () => {
    const testRoot = join(process.cwd(), 'node_modules', '.cache', 'kyc-tests');
    await mkdir(testRoot, { recursive: true });
    directory = await mkdtemp(join(testRoot, 'srv-kyc-'));
    controller = new UploadController();
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
  async function file(name: string, mimetype: string, bytes: Buffer) {
    const path = join(directory, name); await writeFile(path, bytes);
    return { filename: name, originalname: name, mimetype, path, destination: directory, size: bytes.length } as Express.Multer.File;
  }
  it('writes a browser-compatible image and returns the actual filename for mobile clients', async () => {
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer();
    const result = await controller.uploadAadharImage(await file('sample.png', 'image/png', bytes), {} as any);
    expect(result.url).toBe(`/uploads/aadhar/${result.filename}`);
    expect((await sharp(await readFile(join(directory, result.filename))).metadata()).format).toBe('webp');
  });
  it('accepts a real image even when the file picker reports a generic MIME type', async () => {
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer();
    const result = await controller.uploadAadharImage(await file('unknown.bin', 'application/octet-stream', bytes), {} as any);
    expect(result.url).toMatch(/^\/uploads\/aadhar\/unknown-optimized\.webp$/);
    expect((await sharp(await readFile(join(directory, result.filename))).metadata()).format).toBe('webp');
  });
  it('accepts a BMP photo and normalizes it for the browser', async () => {
    const bmp = Buffer.from('Qk06AAAAAAAAADYAAAAoAAAAAQAAAP////8BABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AA==', 'base64');
    const result = await controller.uploadAadharImage(await file('photo.bmp', 'image/bmp', bmp), {} as any);
    expect(result.filename).toMatch(/-optimized\.webp$/);
    expect((await sharp(await readFile(join(directory, result.filename))).metadata()).format).toBe('webp');
  });
  it('stores admin PDFs as files rather than database data URLs', async () => {
    const result = await controller.uploadKycDocument(await file('sample.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n%%EOF')), {} as any);
    expect(result.url).toBe('/uploads/aadhar/sample.pdf');
    expect(await readFile(join(directory, result.filename), 'utf8')).toContain('%PDF-');
  });
  it('detects a PDF by content and gives it a PDF filename even if its MIME type is wrong', async () => {
    const result = await controller.uploadAadharImage(await file('scan.bin', 'application/octet-stream', Buffer.from('%PDF-1.4\n%%EOF')), {} as any);
    expect(result.url).toBe('/uploads/aadhar/scan.pdf');
    expect(await readFile(join(directory, result.filename), 'utf8')).toContain('%PDF-');
  });
  it('rejects a corrupt image instead of returning a broken image URL', async () => {
    await expect(controller.uploadKycDocument(await file('bad.jpg', 'image/jpeg', Buffer.from('invalid')), {} as any)).rejects.toThrow('valid photo or PDF');
  });
  it('rejects files only pretending to be PDFs', async () => {
    await expect(controller.uploadKycDocument(await file('bad.pdf', 'application/pdf', Buffer.from('invalid')), {} as any)).rejects.toThrow('valid photo or PDF');
  });
  it('rejects an SVG that could contain active or external content', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');
    await expect(controller.uploadKycDocument(await file('unsafe.svg', 'image/svg+xml', svg), {} as any)).rejects.toThrow('valid photo or PDF');
  });
});
