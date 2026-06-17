import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomBytes } from 'node:crypto';

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

const csvPath = process.argv[2];
if (!csvPath) {
  throw new Error('Usage: node scripts/import-razorpay-keys.mjs <razorpay-keys.csv>');
}

const csv = await fs.readFile(path.resolve(csvPath), 'utf8');
const rows = csv
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map(parseCsvLine);

const credentials = new Map(rows.slice(1).map(([keyType, value]) => [keyType, value]));
const keyId = credentials.get('Test Key ID') || credentials.get('Live Key ID');
const keySecret = credentials.get('Test Key Secret') || credentials.get('Live Key Secret');

if (!keyId || !keySecret) {
  throw new Error('CSV does not contain a matching Razorpay Key ID and Key Secret');
}

const envPath = path.resolve('.env');
let envContent = await fs.readFile(envPath, 'utf8');
envContent = setEnvValue(envContent, 'RAZORPAY_KEY_ID', keyId);
envContent = setEnvValue(envContent, 'RAZORPAY_KEY_SECRET', keySecret);
const existingWebhookSecret = envContent.match(/^RAZORPAY_WEBHOOK_SECRET=(.*)$/m)?.[1]?.trim();
if (!existingWebhookSecret) {
  envContent = setEnvValue(envContent, 'RAZORPAY_WEBHOOK_SECRET', randomBytes(32).toString('hex'));
}
await fs.writeFile(envPath, envContent, 'utf8');

console.log('Razorpay credentials imported into backend .env successfully.');
