\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('srv-legacy-migration'));
SET LOCAL synchronous_commit = off;

DO $$
BEGIN
  IF to_regclass('legacy_mysql.tbl_redeem_codes_details') IS NULL THEN
    RAISE EXCEPTION 'legacy QR source table is not loaded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "migration_runs" WHERE status = 'running') THEN
    RAISE EXCEPTION 'no running migration record exists';
  END IF;
  IF EXISTS (SELECT 1 FROM "qr_codes") THEN
    RAISE EXCEPTION 'target qr_codes table is not empty';
  END IF;
END $$;

CREATE TEMP TABLE current_migration_run ON COMMIT DROP AS
SELECT id FROM "migration_runs" WHERE status = 'running' ORDER BY "startedAt" DESC LIMIT 1;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_redeem_codes_details',
  min(q.qr_code_id),
  'missing_product_reference',
  'warning',
  jsonb_build_object(
    'legacyProductId', q.qr_code_p_id,
    'affectedQrCount', count(*)
  )
FROM legacy_mysql.tbl_redeem_codes_details q
JOIN current_migration_run r ON true
LEFT JOIN legacy_mysql.tbl_product p ON p.product_id = q.qr_code_p_id
WHERE p.product_id IS NULL
GROUP BY r.id, q.qr_code_p_id;

INSERT INTO "products" (
  id, name, sub, category, points, price, stock, "totalScanned", sku,
  description, "isActive", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:missing_product:' || q.qr_code_p_id),
  'Archived Legacy Product ' || q.qr_code_p_id,
  'Placeholder created to preserve legacy QR ownership',
  'Legacy Missing Product',
  0,
  0,
  0,
  0,
  'LEGACY-MISSING-' || q.qr_code_p_id,
  'The source product record was absent from the final MySQL dump.',
  false,
  now(),
  now()
FROM legacy_mysql.tbl_redeem_codes_details q
LEFT JOIN legacy_mysql.tbl_product p ON p.product_id = q.qr_code_p_id
WHERE p.product_id IS NULL
GROUP BY q.qr_code_p_id;

DROP INDEX IF EXISTS "IDX_qr_codes_batchId";
DROP INDEX IF EXISTS "IDX_qr_codes_batchNo";
DROP INDEX IF EXISTS "IDX_qr_codes_productId";
DROP INDEX IF EXISTS "IDX_qr_codes_isScanned_isActive";
DROP INDEX IF EXISTS "IDX_qr_codes_createdAt";
DROP INDEX IF EXISTS "IDX_qr_codes_legacyRedeemerId";

INSERT INTO "qr_codes" (
  id, "legacyId", code, "productId", "productName", "qrImageUrl", "isScanned",
  "scanCount", "lastScannedBy", "lastScannedAt", "legacyRedeemerId",
  "redeemerName", "redeemerPhone", "redeemerCode", "batchId", "batchNo",
  "sequenceNo", "rewardPoints", "isActive", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v4(),
  q.qr_code_id,
  q.qr_code::text,
  CASE WHEN p.product_id IS NOT NULL
    THEN uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product:' || q.qr_code_p_id)
    ELSE uuid_generate_v5(uuid_ns_url(), 'srv:legacy:missing_product:' || q.qr_code_p_id)
  END,
  COALESCE(NULLIF(btrim(p.product_name::text), ''), 'Archived Legacy Product ' || q.qr_code_p_id),
  NULLIF(btrim(q.qr_code_img::text), ''),
  q.qr_code_status::text = '1',
  CASE WHEN q.qr_code_status::text = '1' THEN 1 ELSE 0 END,
  map."targetId"::text,
  migration_support.to_timestamp(q.qr_code_redeem_date::text),
  q.qr_code_redeem_user_id,
  NULLIF(btrim(u.user_name::text), ''),
  NULLIF(btrim(u.phone::text), ''),
  NULLIF(btrim(u.code::text), ''),
  'legacy-batch-' || q.qr_id,
  COALESCE(batch.qr_batch_no, q.qr_id),
  q.qr_code_id,
  migration_support.to_numeric(q.qr_code_price::text),
  q.qr_code_status::text = '0',
  COALESCE(migration_support.to_timestamp(q.qr_code_generate_date::text), now()),
  now()
FROM legacy_mysql.tbl_redeem_codes_details q
LEFT JOIN legacy_mysql.tbl_redeem_codes batch ON batch.qr_id = q.qr_id
LEFT JOIN legacy_mysql.tbl_product p ON p.product_id = q.qr_code_p_id
LEFT JOIN legacy_mysql.tbl_users u ON u.user_id = q.qr_code_redeem_user_id
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users'
 AND map."sourceId" = q.qr_code_redeem_user_id;

CREATE INDEX "IDX_qr_codes_batchId" ON "qr_codes" ("batchId");
CREATE INDEX "IDX_qr_codes_batchNo" ON "qr_codes" ("batchNo");
CREATE INDEX "IDX_qr_codes_productId" ON "qr_codes" ("productId");
CREATE INDEX "IDX_qr_codes_isScanned_isActive" ON "qr_codes" ("isScanned", "isActive");
CREATE INDEX "IDX_qr_codes_createdAt" ON "qr_codes" ("createdAt" DESC);
CREATE INDEX "IDX_qr_codes_legacyRedeemerId" ON "qr_codes" ("legacyRedeemerId");

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_redeem_codes_details',
  q.qr_code_id,
  'missing_redeemer_reference',
  'warning',
  jsonb_build_object('legacyRedeemerId', q.qr_code_redeem_user_id, 'qrCode', q.qr_code)
FROM legacy_mysql.tbl_redeem_codes_details q
JOIN current_migration_run r ON true
LEFT JOIN legacy_mysql.tbl_users u ON u.user_id = q.qr_code_redeem_user_id
WHERE q.qr_code_redeem_user_id IS NOT NULL
  AND q.qr_code_redeem_user_id <> 0
  AND u.user_id IS NULL;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_redeem_codes_details',
  q.qr_code_id,
  'pending_qr_has_redeemer',
  'warning',
  jsonb_build_object('legacyRedeemerId', q.qr_code_redeem_user_id, 'qrCode', q.qr_code)
FROM legacy_mysql.tbl_redeem_codes_details q
JOIN current_migration_run r ON true
WHERE q.qr_code_status::text = '0'
  AND q.qr_code_redeem_user_id IS NOT NULL
  AND q.qr_code_redeem_user_id <> 0;

INSERT INTO "scans" (
  id, "userId", "userName", role, "productId", "productName", points,
  mode, "qrCodeId", "scannedAt"
)
SELECT
  uuid_generate_v4(),
  map."targetId"::text,
  COALESCE(NULLIF(btrim(u.user_name::text), ''), 'Legacy User'),
  CASE WHEN u.user_type::text = '2' THEN 'dealer' ELSE 'electrician' END::scans_role_enum,
  target_qr."productId",
  target_qr."productName",
  target_qr."rewardPoints",
  'single'::scans_mode_enum,
  target_qr.id::text,
  COALESCE(target_qr."lastScannedAt", target_qr."createdAt")
FROM "qr_codes" target_qr
JOIN legacy_mysql.tbl_redeem_codes_details q ON q.qr_code_id = target_qr."legacyId"
JOIN legacy_mysql.tbl_users u ON u.user_id = q.qr_code_redeem_user_id
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users'
 AND map."sourceId" = u.user_id
WHERE q.qr_code_status::text = '1';

WITH scan_totals AS (
  SELECT "productId", count(*)::integer AS scan_count
  FROM "qr_codes"
  WHERE "isScanned" = true
  GROUP BY "productId"
)
UPDATE "products" p
SET "totalScanned" = totals.scan_count
FROM scan_totals totals
WHERE p.id = totals."productId";

WITH user_scan_totals AS (
  SELECT "userId", role, count(*)::integer AS scan_count, sum(points) AS total_points
  FROM "scans"
  GROUP BY "userId", role
)
UPDATE "electricians" e
SET "totalScans" = totals.scan_count,
    "totalPoints" = totals.total_points
FROM user_scan_totals totals
WHERE totals.role = 'electrician' AND e.id::text = totals."userId";

COMMIT;

ANALYZE "qr_codes";
ANALYZE "scans";
