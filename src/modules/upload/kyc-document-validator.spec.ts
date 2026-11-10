import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  invalidKycDocumentMessage,
  matchesKycDocumentText,
  shutdownKycOcrWorker,
  validateKycDocumentFile,
  warmKycOcrWorker,
} from './kyc-document-validator';
const sharp = require('sharp');

jest.setTimeout(60_000);

describe('KYC document content validation', () => {
  beforeAll(async () => {
    await warmKycOcrWorker();
  });

  afterAll(async () => {
    await shutdownKycOcrWorker();
  });

  it('accepts Aadhaar text and rejects an unrelated photo caption', () => {
    expect(matchesKycDocumentText('Government of India AADHAAR 1234 5678 9012', 'aadhar-front')).toBe(true);
    expect(matchesKycDocumentText('Birthday picnic at the park', 'aadhar-front')).toBe(false);
  });

  it('accepts PAN text and rejects an Aadhaar in the PAN field', () => {
    expect(matchesKycDocumentText('INCOME TAX DEPARTMENT Permanent Account Number ABCDE1234F', 'pan')).toBe(true);
    expect(matchesKycDocumentText('Government of India AADHAAR 1234 5678 9012', 'pan')).toBe(false);
  });

  it('returns a document-specific user message', () => {
    expect(invalidKycDocumentMessage('pan')).toContain('valid PAN Card');
    expect(invalidKycDocumentMessage('aadhar-front')).toContain('valid Aadhaar Card');
  });

  it('runs local OCR against an uploaded PAN image without an external service', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'srv-kyc-ocr-'));
    const imagePath = join(directory, 'pan.png');
    const svg = Buffer.from(`
      <svg width="1400" height="850" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="80" y="180" font-size="72" font-family="Arial" fill="black">INCOME TAX DEPARTMENT</text>
        <text x="80" y="330" font-size="62" font-family="Arial" fill="black">PERMANENT ACCOUNT NUMBER</text>
        <text x="80" y="500" font-size="90" font-family="Arial" fill="black">ABCDE1234F</text>
      </svg>`);
    try {
      await sharp(svg).png().toFile(imagePath);
      await expect(validateKycDocumentFile(imagePath, 'image/png', 'pan')).resolves.toBe(true);
      // A second upload uses the already initialized worker instead of paying
      // the Tesseract language/worker startup cost again.
      await expect(validateKycDocumentFile(imagePath, 'image/png', 'pan')).resolves.toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('accepts an Aadhaar image in the Aadhaar field but not in the PAN field', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'srv-kyc-aadhaar-'));
    const imagePath = join(directory, 'aadhaar.png');
    const svg = Buffer.from(`
      <svg width="1400" height="850" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="80" y="180" font-size="72" font-family="Arial" fill="black">GOVERNMENT OF INDIA</text>
        <text x="80" y="340" font-size="82" font-family="Arial" fill="black">AADHAAR</text>
        <text x="80" y="520" font-size="90" font-family="Arial" fill="black">1234 5678 9012</text>
      </svg>`);
    try {
      await sharp(svg).png().toFile(imagePath);
      await expect(validateKycDocumentFile(imagePath, 'image/png', 'aadhar-front')).resolves.toBe(true);
      await expect(validateKycDocumentFile(imagePath, 'image/png', 'pan')).resolves.toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
