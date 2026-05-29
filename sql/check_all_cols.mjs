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

for (const table of ['dealers', 'electricians', 'app_users', 'counterboys']) {
  console.log(`\n=== ${table} ===`);
  const res = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  res.rows.forEach(r => console.log('  ' + r.column_name));
}

await client.end();
