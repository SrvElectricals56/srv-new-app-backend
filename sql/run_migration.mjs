import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '4268',
  database: process.env.DB_DATABASE || 'srv_admin',
});

await client.connect();

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '20260529_add_token_version.sql'), 'utf8');
for (const stmt of sql.split(';').filter(s => s.trim())) {
  try {
    await client.query(stmt);
    console.log('OK:', stmt.trim().substring(0, 80));
  } catch (e) {
    // Column might already exist
    if (e.code === '42701') {
      console.log('SKIP (already exists):', stmt.trim().substring(0, 80));
    } else {
      console.error('ERROR:', e.message);
    }
  }
}

await client.end();
console.log('Migration done.');
