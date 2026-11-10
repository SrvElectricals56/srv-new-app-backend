import { readFile } from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import { createWorker, type Worker } from 'tesseract.js';
const sharp: any = require('sharp');
const englishLanguageData: { langPath: string; gzip: boolean } = require('@tesseract.js-data/eng');

let ocrWorkerPromise: Promise<Worker> | null = null;
let ocrQueue: Promise<void> = Promise.resolve();

async function createOcrWorker() {
  return createWorker('eng', 1, {
    langPath: englishLanguageData.langPath,
    gzip: englishLanguageData.gzip,
  });
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    const pendingWorker = createOcrWorker();
    ocrWorkerPromise = pendingWorker;
    void pendingWorker.catch(() => {
      if (ocrWorkerPromise === pendingWorker) ocrWorkerPromise = null;
    });
  }
  return ocrWorkerPromise;
}

function runOcrJob<T>(job: (worker: Worker) => Promise<T>) {
  const result = ocrQueue.then(async () => job(await getOcrWorker()));
  ocrQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function warmKycOcrWorker() {
  await getOcrWorker();
}

export async function shutdownKycOcrWorker() {
  await ocrQueue.catch(() => undefined);
  const pendingWorker = ocrWorkerPromise;
  ocrWorkerPromise = null;
  const worker = await pendingWorker?.catch(() => null);
  await worker?.terminate().catch(() => undefined);
}

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
  return runOcrJob(async (worker) => {
    try {
      const result = await worker.recognize(image);
      return result.data.text || '';
    } catch {
      // Recover once from a crashed native/WASM worker instead of making all
      // later uploads fail until the backend process is restarted.
      if (ocrWorkerPromise) ocrWorkerPromise = null;
      await worker.terminate().catch(() => undefined);
      const replacement = await getOcrWorker();
      const result = await replacement.recognize(image);
      return result.data.text || '';
    }
  });
}

async function recognizePreparedImage(path: string, width: number) {
  const prepared = await sharp(path)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .png({ compressionLevel: 1 })
    .toBuffer();
  return recognizeImage(prepared);
}

async function validatePdf(path: string, documentType: KycDocumentType) {
  const parser = new PDFParse({ data: await readFile(path) });
  try {
    const textResult = await parser.getText({ first: 1 });
    if (matchesKycDocumentText(textResult.text || '', documentType)) return true;

    // Most clear scans validate quickly at 900px. Only retry at a higher
    // resolution when the fast pass cannot find enough document signals.
    for (const desiredWidth of [900, 1400]) {
      const screenshot = await parser.getScreenshot({ first: 1, desiredWidth, imageDataUrl: false, imageBuffer: true });
      const firstPage = screenshot.pages[0]?.data;
      if (firstPage && matchesKycDocumentText(await recognizeImage(Buffer.from(firstPage)), documentType)) return true;
    }
    return false;
  } finally {
    await parser.destroy();
  }
}

export async function validateKycDocumentFile(path: string, mimeType: string, documentType: KycDocumentType) {
  if (mimeType === 'application/pdf') return validatePdf(path, documentType);

  const fastText = await recognizePreparedImage(path, 900);
  if (matchesKycDocumentText(fastText, documentType)) return true;

  const highQualityText = await recognizePreparedImage(path, 1400);
  return matchesKycDocumentText(highQualityText, documentType);
}
