import { readFile } from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
const sharp: any = require('sharp');
const englishLanguageData: { langPath: string; gzip: boolean } = require('@tesseract.js-data/eng');

export type KycDocumentType = 'aadhar-front' | 'aadhar-back' | 'pan' | 'gst';

function normalizedText(value: string) {
  return value
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesKycDocumentText(value: string, documentType: KycDocumentType) {
  const text = normalizedText(value);
  if (!text) return false;

  if (documentType === 'aadhar-front' || documentType === 'aadhar-back') {
    const signals = [
      /AADHA{1,2}R|AADHAR/.test(text),
      /UNIQUE IDENTIFICATION AUTHORITY/.test(text),
      /GOVERNMENT OF INDIA|GOVT OF INDIA/.test(text),
      /\b\d{4}\s*\d{4}\s*\d{4}\b/.test(text.replace(/[O]/g, '0')),
    ];
    return signals.filter(Boolean).length >= 2;
  }

  if (documentType === 'pan') {
    const signals = [
      /PERMANENT ACCOUNT NUMBER/.test(text),
      /INCOME TAX DEPARTMENT/.test(text),
      /\b[A-Z]{5}\s*\d{4}\s*[A-Z]\b/.test(text),
    ];
    return signals.filter(Boolean).length >= 2;
  }

  return /GOODS AND SERVICES TAX|GSTIN/.test(text) || /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/.test(text);
}

export function invalidKycDocumentMessage(documentType: KycDocumentType) {
  if (documentType === 'pan') return 'Please upload a valid PAN Card image or PDF.';
  if (documentType === 'gst') return 'Please upload a valid GST document image or PDF.';
  return 'Please upload a valid Aadhaar Card image or PDF.';
}

async function recognizeImage(image: string | Buffer) {
  const worker = await createWorker('eng', 1, {
    langPath: englishLanguageData.langPath,
    gzip: englishLanguageData.gzip,
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}

async function recognizePreparedImage(path: string) {
  const prepared = await sharp(path)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
  return recognizeImage(prepared);
}

async function recognizePdf(path: string, documentType: KycDocumentType) {
  const parser = new PDFParse({ data: await readFile(path) });
  try {
    const textResult = await parser.getText({ first: 1 });
    if (matchesKycDocumentText(textResult.text || '', documentType)) return textResult.text || '';

    const screenshot = await parser.getScreenshot({ first: 1, desiredWidth: 1800, imageDataUrl: false, imageBuffer: true });
    const firstPage = screenshot.pages[0]?.data;
    return firstPage ? recognizeImage(Buffer.from(firstPage)) : textResult.text || '';
  } finally {
    await parser.destroy();
  }
}

export async function validateKycDocumentFile(path: string, mimeType: string, documentType: KycDocumentType) {
  const text = mimeType === 'application/pdf'
    ? await recognizePdf(path, documentType)
    : await recognizePreparedImage(path);
  return matchesKycDocumentText(text, documentType);
}
