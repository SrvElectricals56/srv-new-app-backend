import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import pg from 'pg';

const { Client } = pg;
const dumpPath = process.argv[2];
if (!dumpPath || !fs.existsSync(dumpPath) || !fs.statSync(dumpPath).isFile()) {
  throw new Error('Pass the full SQL dump file path as the first argument.');
}

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:4268@localhost:5433/srv_admin';
const markers = {
  products: Buffer.from('INSERT INTO `tbl_product` VALUES '),
  qrs: Buffer.from('INSERT INTO `tbl_redeem_codes_details` VALUES '),
  users: Buffer.from('INSERT INTO `tbl_users` VALUES '),
};

const normalizeName = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '');

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const parseDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('0000-00-00')) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] || '00'}:${iso[5] || '00'}:${iso[6] || '00'}+05:30`;
  const indian = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (indian) return `${indian[3]}-${indian[2]}-${indian[1]}T${indian[4] || '00'}:${indian[5] || '00'}:${indian[6] || '00'}+05:30`;
  return null;
};

async function locateTables() {
  const found = {};
  const maxMarker = Math.max(...Object.values(markers).map((marker) => marker.length));
  let tail = Buffer.alloc(0);
  let consumed = 0;
  for await (const chunk of fs.createReadStream(dumpPath, { highWaterMark: 4 * 1024 * 1024 })) {
    const combined = tail.length ? Buffer.concat([tail, chunk]) : chunk;
    const combinedOffset = consumed - tail.length;
    for (const [name, marker] of Object.entries(markers)) {
      if (found[name] !== undefined) continue;
      const index = combined.indexOf(marker);
      if (index >= 0) found[name] = combinedOffset + index + marker.length;
    }
    consumed += chunk.length;
    tail = combined.subarray(Math.max(0, combined.length - maxMarker + 1));
    if (Object.keys(found).length === Object.keys(markers).length) break;
  }
  for (const name of Object.keys(markers)) {
    if (found[name] === undefined) throw new Error(`Could not locate ${name} INSERT statement in dump.`);
  }
  return found;
}

async function parseInsertRows(start, onRow) {
  const stream = fs.createReadStream(dumpPath, { start, highWaterMark: 1024 * 1024 });
  const decoder = new StringDecoder('utf8');
  let inString = false;
  let escaped = false;
  let inTuple = false;
  let field = '';
  let row = [];
  let rows = 0;
  let stopped = false;

  const consume = async (text) => {
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          const replacements = { n: '\n', r: '\r', t: '\t', b: '\b', '0': '\0', Z: '\x1a' };
          field += replacements[char] ?? char;
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === "'") {
          if (text[index + 1] === "'") {
            field += "'";
            index += 1;
          } else {
            inString = false;
          }
        } else {
          field += char;
        }
        continue;
      }
      if (char === "'") {
        inString = true;
      } else if (char === '(' && !inTuple) {
        inTuple = true;
        field = '';
        row = [];
      } else if (char === ',' && inTuple) {
        row.push(field.trim() === 'NULL' ? null : field.trim());
        field = '';
      } else if (char === ')' && inTuple) {
        row.push(field.trim() === 'NULL' ? null : field.trim());
        await onRow(row, rows);
        rows += 1;
        inTuple = false;
        field = '';
        row = [];
      } else if (char === ';' && !inTuple) {
        stopped = true;
        stream.destroy();
        return;
      } else if (inTuple) {
        field += char;
      }
    }
  };

  for await (const chunk of stream) {
    await consume(decoder.write(chunk));
    if (stopped) break;
  }
  if (!stopped) await consume(decoder.end());
  return rows;
}

const client = new Client({ connectionString });
await client.connect();

try {
  console.log('Locating legacy tables in the SQL dump...');
  const offsets = await locateTables();

  const legacyProducts = new Map();
  await parseInsertRows(offsets.products, async (row) => {
    if (row[0] && row[2]) legacyProducts.set(String(row[0]), String(row[2]));
  });

  const legacyUsers = new Map();
  await parseInsertRows(offsets.users, async (row) => {
    const id = Number(row[0]);
    if (!Number.isFinite(id)) return;
    legacyUsers.set(id, {
      name: String(row[2] || ''),
      phone: normalizePhone(row[6]),
      code: String(row[19] || ''),
    });
  });

  const productsResult = await client.query('SELECT id, name, sku FROM products');
  const currentByName = new Map(productsResult.rows.map((product) => [normalizeName(product.name), product]));
  const currentByLegacySku = new Map(productsResult.rows
    .filter((product) => /^SRV-CB-\d+$/i.test(String(product.sku || '')))
    .map((product) => [String(Number(String(product.sku).match(/\d+$/)[0])), product]));
  const productMap = new Map();
  const unmatchedProducts = [];
  for (const [legacyId, legacyName] of legacyProducts) {
    const current = currentByName.get(normalizeName(legacyName)) || currentByLegacySku.get(String(Number(legacyId)));
    if (current) productMap.set(legacyId, current);
    else unmatchedProducts.push({ legacyId, legacyName });
  }

  const currentUsersResult = await client.query(`
    SELECT id::text AS id, phone FROM electricians
    UNION ALL SELECT id::text, phone FROM dealers
    UNION ALL SELECT id::text, phone FROM app_users
    UNION ALL SELECT id::text, phone FROM counterboys
  `);
  const currentUserByPhone = new Map(currentUsersResult.rows.map((user) => [normalizePhone(user.phone), user.id]));

  console.log(`Mapped ${productMap.size}/${legacyProducts.size} legacy products; loaded ${legacyUsers.size} legacy users.`);
  if (!productMap.size) throw new Error('No legacy products matched current products; import stopped safely.');

  const backupName = `qr_codes_backup_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  await client.query(`CREATE TABLE "${backupName}" AS TABLE "qr_codes"`);
  console.log(`Created safety backup table ${backupName}.`);

  await client.query(`
    ALTER TABLE "qr_codes"
      ADD COLUMN IF NOT EXISTS "legacyRedeemerId" integer,
      ADD COLUMN IF NOT EXISTS "redeemerName" character varying,
      ADD COLUMN IF NOT EXISTS "redeemerPhone" character varying,
      ADD COLUMN IF NOT EXISTS "redeemerCode" character varying
  `);

  const batch = [];
  let imported = 0;
  let skipped = 0;
  let skippedWithoutCode = 0;
  const skippedByProduct = new Map();
  let redeemed = 0;
  let matchedRedeemers = 0;
  const flush = async () => {
    if (!batch.length) return;
    const columns = Array.from({ length: 16 }, () => []);
    for (const item of batch) item.forEach((value, index) => columns[index].push(value));
    await client.query(`
      INSERT INTO "qr_codes"
        ("code","productId","productName","isScanned","scanCount","lastScannedBy","lastScannedAt","batchId","sequenceNo","rewardPoints","isActive","legacyRedeemerId","redeemerName","redeemerPhone","redeemerCode","createdAt")
      SELECT * FROM unnest(
        $1::text[], $2::uuid[], $3::text[], $4::boolean[], $5::integer[], $6::text[], $7::timestamptz[], $8::text[],
        $9::integer[], $10::integer[], $11::boolean[], $12::integer[], $13::text[], $14::text[], $15::text[], $16::timestamptz[]
      )
      ON CONFLICT ("code") DO UPDATE SET
        "isScanned" = EXCLUDED."isScanned",
        "scanCount" = EXCLUDED."scanCount",
        "lastScannedBy" = COALESCE(EXCLUDED."lastScannedBy", "qr_codes"."lastScannedBy"),
        "lastScannedAt" = EXCLUDED."lastScannedAt",
        "legacyRedeemerId" = EXCLUDED."legacyRedeemerId",
        "redeemerName" = EXCLUDED."redeemerName",
        "redeemerPhone" = EXCLUDED."redeemerPhone",
        "redeemerCode" = EXCLUDED."redeemerCode",
        "updatedAt" = now()
    `, columns);
    imported += batch.length;
    batch.length = 0;
  };

  console.log('Importing QR codes and redeemed-person details...');
  await parseInsertRows(offsets.qrs, async (row, rowNumber) => {
    const code = String(row[5] || '').trim();
    const product = productMap.get(String(row[2]));
    if (!code || !product) {
      skipped += 1;
      if (!code) skippedWithoutCode += 1;
      if (!product) {
        const legacyProductId = String(row[2] ?? 'NULL');
        skippedByProduct.set(legacyProductId, (skippedByProduct.get(legacyProductId) || 0) + 1);
      }
      return;
    }
    const legacyUserId = Number(row[7]) || null;
    const legacyUser = legacyUserId ? legacyUsers.get(legacyUserId) : null;
    const isScanned = Boolean(legacyUserId) || String(row[10]) === '1';
    const currentUserId = legacyUser?.phone ? currentUserByPhone.get(legacyUser.phone) || null : null;
    if (isScanned) redeemed += 1;
    if (currentUserId) matchedRedeemers += 1;
    const generatedAt = parseDate(row[9]) || new Date('2020-01-01T00:00:00+05:30').toISOString();
    batch.push([
      code,
      product.id,
      product.name,
      isScanned,
      isScanned ? 1 : 0,
      currentUserId,
      isScanned ? parseDate(row[8]) : null,
      `LEGACY-${row[1]}`,
      Number(row[0]) || null,
      Math.max(0, Math.round(Number(row[3]) || 0)),
      true,
      legacyUserId,
      legacyUser?.name || null,
      legacyUser?.phone || null,
      legacyUser?.code || null,
      generatedAt,
    ]);
    if (batch.length >= 2000) await flush();
    if (rowNumber > 0 && rowNumber % 250000 === 0) console.log(`Processed ${rowNumber.toLocaleString('en-IN')} rows; imported ${imported.toLocaleString('en-IN')}...`);
  });
  await flush();

  await client.query(`
    CREATE INDEX IF NOT EXISTS "IDX_qr_codes_legacyRedeemerId" ON "qr_codes" ("legacyRedeemerId");
    ANALYZE "qr_codes";
  `);
  const totals = await client.query(`SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE "isScanned")::bigint AS scanned FROM "qr_codes"`);
  console.log(JSON.stringify({
    imported,
    skipped,
    skippedWithoutCode,
    skippedByProduct: [...skippedByProduct.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([legacyProductId, count]) => ({ legacyProductId, legacyName: legacyProducts.get(legacyProductId) || null, count })),
    redeemed,
    matchedRedeemers,
    databaseTotal: totals.rows[0].total,
    databaseScanned: totals.rows[0].scanned,
    unmatchedProducts: unmatchedProducts.slice(0, 30),
    backupTable: backupName,
  }, null, 2));
} finally {
  await client.end();
}
