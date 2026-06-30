const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv(file) {
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    env[line.slice(0, index)] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function loadTransform(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n')
    .replaceAll(":'source_file'", "'fixture.sql.gz'")
    .replaceAll(":'source_sha256'", `'${'f'.repeat(64)}'`);
}

const root = path.resolve(__dirname, '..', '..');
const env = loadEnv(path.join(root, '.env'));
const client = new Client({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 5433),
  user: env.DB_USERNAME || 'postgres',
  password: env.DB_PASSWORD || '',
  database: 'srv_schema_gen',
});

const fixtureSql = `
DROP SCHEMA IF EXISTS legacy_mysql CASCADE;
CREATE SCHEMA legacy_mysql;

TRUNCATE TABLE
  legacy_import_exceptions, legacy_entity_map, migration_runs,
  wallet_transactions, support_tickets, testimonials, settings, points_config,
  scans, redemptions, qr_codes, product_orders, product_cart_items,
  product_variants, products, product_categories, plays, offers, notifications,
  gift_orders, electricians, dealers, counterboys, banners, app_users,
  app_icons, app_activity_events, admin_permissions, admins
RESTART IDENTITY CASCADE;

CREATE TABLE legacy_mysql.tbl_users (
  user_id int PRIMARY KEY, user_type int, user_name text, email text, imageurl text,
  phone text, address text, state text, district text, city text, pincode text,
  status text, code text, gst_number text, bank_status int, upiid text,
  account_number text, ifsc_code text, bank_name text, account_holder_name text,
  kyc_status int, pan_card text, adharcard_front text, document text,
  dealer_code text, sells_code text, wallet text, created_at timestamp
);
CREATE TABLE legacy_mysql.tbl_category (
  category_id int PRIMARY KEY, category_name text, category_image text, category_status int
);
CREATE TABLE legacy_mysql.tbl_product (
  product_id int PRIMARY KEY, category_id int, product_name text, product_batch_no text,
  product_image text, product_short_desc text, product_long_desc text,
  product_desc text, how_to_use text, product_status int
);
CREATE TABLE legacy_mysql.tbl_product_variant (
  pv_id int PRIMARY KEY, product_id int, measurement int, pv_qty int, pv_unit text,
  pv_dis_price numeric, pv_ori_price numeric, pv_stock int, pv_sell_qnt int, pv_status int
);
CREATE TABLE legacy_mysql.tbl_redeem_codes (
  qr_id int PRIMARY KEY, p_id int, qr_price text, qr_batch_no int
);
CREATE TABLE legacy_mysql.tbl_redeem_codes_details (
  qr_code_id int PRIMARY KEY, qr_id int, qr_code_p_id int, qr_code_price text,
  qr_code text UNIQUE, qr_code_img text, qr_code_redeem_user_id int,
  qr_code_redeem_date date, qr_code_generate_date text, qr_code_status int
);
CREATE TABLE legacy_mysql.tbl_redeem_product (
  redeem_product_id int PRIMARY KEY, redeem_user_type int, redeem_product_name text,
  redeem_product_image text, redeem_product_point text, redeem_product_desc text,
  redeem_product_mrp text, redeem_product_status int
);
CREATE TABLE legacy_mysql.tbl_banner (
  b_id int PRIMARY KEY, b_name text, b_image text, b_status int
);
CREATE TABLE legacy_mysql.tbl_testimonial (
  testimonial_id int PRIMARY KEY, testimonial_name text, testimonial_image text,
  testimonial_rate text, testimonial_review text, testimonial_status int
);
CREATE TABLE legacy_mysql.tbl_offer (
  offer_id int PRIMARY KEY, offer_name text, offer_image text, offer_status int
);
CREATE TABLE legacy_mysql.tbl_notification (
  id int PRIMARY KEY, type int, user_id int, date text, tittle text,
  link text, image text, msg text
);
CREATE TABLE legacy_mysql.tbl_enquiry (
  enq_id int PRIMARY KEY, user_id int, enq_subject text, enq_comment text,
  enq_image text, enq_response text, enq_type text
);
CREATE TABLE legacy_mysql.tbl_settings (
  id int PRIMARY KEY, app_name text, app_email text, app_contact text, app_website text,
  app_privacy_policy text, app_terms_condition text, min_transfer_point text,
  refer_point text, app_version text, app_maintenance_status int,
  app_maintenance_description text
);
CREATE TABLE legacy_mysql.tbl_wallet_history (
  wallet_id int PRIMARY KEY, user_id int, wallet_desc text, wallet_date text,
  wallet_cdate text, wallet_amount text, wallet_payment_type text, wallet_type text
);
CREATE TABLE legacy_mysql.tbl_withdrawal (
  w_id int PRIMARY KEY, user_id int, w_desc text, w_amount text, w_type text,
  w_cdate text, w_date text
);
CREATE TABLE legacy_mysql.tbl_user_redeem (
  user_redeem_id int PRIMARY KEY, user_id int, product_id int,
  user_redeem_address text, user_redeem_amount text, receiver_name text,
  user_redeem_date text, user_redeem_type int, courier_name text, tracking_id text
);

INSERT INTO legacy_mysql.tbl_users VALUES
  (1,2,'Dealer One','dealer@example.test','', '9999999999','Shop','Punjab','Ludhiana','Ludhiana','141001','1','REF-DLR','',2,'','111','IFSC1','Bank','Dealer One',2,'','','','DLR1','', '100.00','2025-01-01'),
  (2,1,'Electrician One','electrician@example.test','', '8888888888','Home','Punjab','Ludhiana','Ludhiana','141001','1','REF-ELC','',2,'','222','IFSC2','Bank','Electrician One',2,'','','','ELC1','DLR1','10.50','2025-01-02'),
  (3,1,'Duplicate Electrician','','', '8888888888','','Punjab','Ludhiana','Ludhiana','','0','REF-DUP','',0,'','','','','',0,'','','','ELC2','DLR1','12.50','2025-01-03'),
  (4,1,'Invalid Phone','','', 'abc','','Punjab','Unknown','Unknown','','1','','',0,'','','','','',0,'','','','','','0','2025-01-04');
INSERT INTO legacy_mysql.tbl_category VALUES (10,'Switches','category.png',1);
INSERT INTO legacy_mysql.tbl_product VALUES
  (100,10,'Main Switch','MS-100','product.png','Short','Long','Description','Use safely',1);
INSERT INTO legacy_mysql.tbl_product_variant VALUES
  (1000,100,10,1,'piece',50.50,60.00,5,1,1);
INSERT INTO legacy_mysql.tbl_redeem_codes VALUES (500,100,'2.50',1);
INSERT INTO legacy_mysql.tbl_redeem_codes_details VALUES
  (10000,500,100,'2.50','QR-PENDING','',NULL,NULL,'2025-02-01',0),
  (10001,500,100,'2.50','QR-REDEEMED','',2,'2025-02-02','2025-02-01',1),
  (10002,500,999,'0.90','QR-MISSING-PRODUCT','',2,NULL,'2025-02-01',0),
  (10003,500,100,'3.50','QR-MISSING-USER','',999,'2025-02-03','2025-02-01',1);
INSERT INTO legacy_mysql.tbl_redeem_product VALUES
  (200,1,'Gift','gift.png','5.50','Gift description','100',1);
INSERT INTO legacy_mysql.tbl_banner VALUES (1,'Banner','banner.png',1);
INSERT INTO legacy_mysql.tbl_testimonial VALUES (1,'Customer','person.png','5','Excellent',1);
INSERT INTO legacy_mysql.tbl_offer VALUES (1,'Offer','offer.png',1);
INSERT INTO legacy_mysql.tbl_notification VALUES
  (1,1,2,'2025-03-01','Title','','','Message');
INSERT INTO legacy_mysql.tbl_enquiry VALUES
  (1,2,'Help','Need help','','Resolved','2');
INSERT INTO legacy_mysql.tbl_settings VALUES
  (1,'SRV Electricals','info@srvelectricals.com','9999999999','https://srvelectricals.com','Privacy','Terms','10','5','2.0.0',0,'Maintenance');
INSERT INTO legacy_mysql.tbl_wallet_history VALUES
  (400,2,'Credit','2025-03-01','2025-03-01','5.50','2','2'),
  (401,2,'Debit','2025-03-02','2025-03-02','1.25','1','4'),
  (402,999,'Orphan','2025-03-03','2025-03-03','2','2','2');
INSERT INTO legacy_mysql.tbl_withdrawal VALUES
  (500,2,'Paid','2.00','2','2025-03-04','2025-03-04'),
  (501,999,'Orphan','3.00','1','2025-03-04','2025-03-04');
INSERT INTO legacy_mysql.tbl_user_redeem VALUES
  (300,2,200,'Address','5.50','Electrician One','2025-03-05',1,'',''),
  (301,999,200,'Address','5.50','Missing User','2025-03-05',1,'','');
`;

async function main() {
  await client.connect();
  try {
    const database = await client.query('select current_database() as name');
    if (database.rows[0].name !== 'srv_schema_gen') {
      throw new Error('Refusing to run fixture outside srv_schema_gen');
    }

    await client.query(fixtureSql);
    for (const name of [
      '10-transform-core.sql',
      '20-transform-qr.sql',
      '30-transform-finance.sql',
      '35-remediate-unmapped.sql',
      '37-remediate-dealer-links.sql',
      '40-reconcile.sql',
    ]) {
      await client.query(loadTransform(path.join(__dirname, name)));
    }

    const result = await client.query(`
      SELECT status, "sourceCounts", "targetCounts", reconciliation
      FROM migration_runs
      ORDER BY "startedAt" DESC
      LIMIT 1
    `);
    if (result.rows[0]?.status !== 'completed') {
      throw new Error(`Fixture migration did not complete: ${JSON.stringify(result.rows[0])}`);
    }
    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
