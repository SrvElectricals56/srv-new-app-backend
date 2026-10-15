import { UploadController } from './upload.controller';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
const sharp = require('sharp');

describe('Persistent KYC uploads', () => {
  let directory: string;
  let controller: UploadController;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'srv-kyc-'));
    controller = new UploadController({ get: () => 'https://api.example.test' } as any);
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
  async function file(name: string, mimetype: string, bytes: Buffer) {
    const path = join(directory, name); await writeFile(path, bytes);
    return { filename: name, originalname: name, mimetype, path, destination: directory, size: bytes.length } as Express.Multer.File;
  }
  it('writes a browser-compatible image and returns the actual filename for mobile clients', async () => {
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer();
    const result = await controller.uploadAadharImage(await file('sample.png', 'image/png', bytes), {} as any);
    expect(result.url).toBe(`https://api.example.test/uploads/aadhar/${result.filename}`);
    expect((await sharp(await readFile(join(directory, result.filename))).metadata()).format).toBe('webp');
  });
  it('stores admin PDFs as files rather than database data URLs', async () => {
    const result = await controller.uploadKycDocument(await file('sample.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n%%EOF')), {} as any);
    expect(result.url).toBe('/uploads/aadhar/sample.pdf');
    expect(await readFile(join(directory, result.filename), 'utf8')).toContain('%PDF-');
  });
  it('rejects a corrupt image instead of returning a broken image URL', async () => {
    await expect(controller.uploadKycDocument(await file('bad.jpg', 'image/jpeg', Buffer.from('invalid')), {} as any)).rejects.toThrow('Unable to read');
  });
  it('rejects files only pretending to be PDFs', async () => {
    await expect(controller.uploadKycDocument(await file('bad.pdf', 'application/pdf', Buffer.from('invalid')), {} as any)).rejects.toThrow('valid PDF');
  });
});
