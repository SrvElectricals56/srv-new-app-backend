\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('srv-legacy-migration'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "migration_runs" WHERE status = 'running') THEN
    RAISE EXCEPTION 'no running migration record exists';
  END IF;
END $$;

CREATE TEMP TABLE current_migration_run ON COMMIT DROP AS
SELECT id FROM "migration_runs" WHERE status = 'running' ORDER BY "startedAt" DESC LIMIT 1;

-- Preserve legacy user roles that have no direct replacement role. These
-- records are inactive audit placeholders and cannot authenticate.
INSERT INTO "app_users" (
  id, name, phone, "userCode", "walletBalance", status, "joinedDate", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:unknown:' || u.user_id),
  COALESCE(NULLIF(btrim(u.user_name::text), ''), 'Legacy Unknown User ' || u.user_id),
  'legacy-unknown-' || u.user_id,
  'LEGACY-UNKNOWN-' || u.user_id,
  migration_support.to_numeric(u.wallet::text),
  'inactive',
  COALESCE(migration_support.to_timestamp(u.created_at::text), now()),
  now()
FROM legacy_mysql.tbl_users u
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = u.user_id
WHERE u.user_type::text NOT IN ('1', '2')
  AND map."sourceId" IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO "legacy_entity_map" (
  "sourceTable", "sourceId", "targetTable", "targetId", "targetKey"
)
SELECT
  'tbl_users',
  u.user_id,
  'app_users',
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:unknown:' || u.user_id),
  u.phone::text
FROM legacy_mysql.tbl_users u
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = u.user_id
WHERE u.user_type::text NOT IN ('1', '2')
  AND map."sourceId" IS NULL;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_users',
  u.user_id,
  'unsupported_legacy_user_role',
  'warning',
  jsonb_build_object(
    'legacyUserType', u.user_type,
    'sourcePhone', u.phone,
    'preservedAs', 'inactive_app_user'
  )
FROM legacy_mysql.tbl_users u
JOIN current_migration_run r ON true
WHERE u.user_type::text NOT IN ('1', '2')
  AND NOT EXISTS (
    SELECT 1 FROM "legacy_import_exceptions" e
    WHERE e."migrationRunId" = r.id
      AND e."sourceTable" = 'tbl_users'
      AND e."sourceId" = u.user_id
      AND e."exceptionType" = 'unsupported_legacy_user_role'
  );

-- Preserve variants whose source product was deleted by attaching them to
-- explicit inactive placeholder products.
INSERT INTO "products" (
  id, name, sub, category, points, price, stock, "totalScanned", sku,
  description, "isActive", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product:' || v.product_id),
  'Archived Variant Product ' || v.product_id,
  'Placeholder created to preserve orphan legacy product variants',
  'Legacy Missing Product',
  0,
  0,
  0,
  0,
  'LEGACY-VARIANT-PROD-' || v.product_id,
  'The product record was missing from the final MySQL dump; variants are retained for audit.',
  false,
  now(),
  now()
FROM legacy_mysql.tbl_product_variant v
LEFT JOIN legacy_mysql.tbl_product p ON p.product_id = v.product_id
WHERE p.product_id IS NULL
GROUP BY v.product_id
ON CONFLICT DO NOTHING;

INSERT INTO "product_variants" (
  id, "legacyId", "productId", measurement, quantity, unit,
  "discountedPrice", "originalPrice", stock, "soldQuantity", "isActive"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product_variant:' || v.pv_id),
  v.pv_id,
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product:' || v.product_id),
  COALESCE(v.measurement, 0),
  COALESCE(v.pv_qty, 0),
  NULLIF(btrim(v.pv_unit::text), ''),
  COALESCE(v.pv_dis_price, 0),
  COALESCE(v.pv_ori_price, 0),
  GREATEST(COALESCE(v.pv_stock, 0), 0),
  GREATEST(COALESCE(v.pv_sell_qnt, 0), 0),
  false
FROM legacy_mysql.tbl_product_variant v
LEFT JOIN legacy_mysql.tbl_product p ON p.product_id = v.product_id
LEFT JOIN "product_variants" target ON target."legacyId" = v.pv_id
WHERE p.product_id IS NULL
  AND target.id IS NULL;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_product_variant',
  min(v.pv_id),
  'missing_variant_product',
  'warning',
  jsonb_build_object('legacyProductId', v.product_id, 'affectedVariantCount', count(*))
FROM legacy_mysql.tbl_product_variant v
JOIN current_migration_run r ON true
LEFT JOIN legacy_mysql.tbl_product p ON p.product_id = v.product_id
WHERE p.product_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "legacy_import_exceptions" e
    WHERE e."migrationRunId" = r.id
      AND e."sourceTable" = 'tbl_product_variant'
      AND e."exceptionType" = 'missing_variant_product'
      AND (e.details ->> 'legacyProductId')::bigint = v.product_id
  )
GROUP BY r.id, v.product_id;

COMMIT;
