import pg from 'pg';
import dotenv from 'dotenv';
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
const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
res.rows.forEach(r => console.log(r.table_name));
await client.end();
