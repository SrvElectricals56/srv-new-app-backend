\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('srv-legacy-migration'));
SET LOCAL synchronous_commit = off;

DO $$
BEGIN
  IF to_regclass('legacy_mysql.tbl_wallet_history') IS NULL THEN
    RAISE EXCEPTION 'legacy finance source tables are not loaded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "migration_runs" WHERE status = 'running') THEN
    RAISE EXCEPTION 'no running migration record exists';
  END IF;
  IF EXISTS (SELECT 1 FROM "wallet_transactions") OR EXISTS (SELECT 1 FROM "redemptions") THEN
    RAISE EXCEPTION 'target finance tables are not empty';
  END IF;
END $$;

CREATE TEMP TABLE current_migration_run ON COMMIT DROP AS
SELECT id FROM "migration_runs" WHERE status = 'running' ORDER BY "startedAt" DESC LIMIT 1;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_wallet_history',
  w.wallet_id,
  'missing_wallet_user',
  'warning',
  jsonb_build_object('legacyUserId', w.user_id, 'amount', w.wallet_amount)
FROM legacy_mysql.tbl_wallet_history w
JOIN current_migration_run r ON true
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id
WHERE map."targetId" IS NULL;

WITH base AS (
  SELECT
    w.wallet_id,
    map."targetId"::text AS target_user_id,
    CASE WHEN u.user_type::text = '2' THEN 'dealer' ELSE 'electrician' END AS target_role,
    CASE WHEN w.wallet_payment_type::text = '2' THEN 'credit' ELSE 'debit' END AS transaction_type,
    CASE w.wallet_type::text
      WHEN '2' THEN 'scan'
      WHEN '3' THEN 'redemption'
      WHEN '4' THEN 'redemption'
      WHEN '6' THEN 'refund'
      WHEN '7' THEN 'transfer'
      WHEN '1' THEN 'commission'
      ELSE 'bonus'
    END AS transaction_source,
    abs(migration_support.to_numeric(w.wallet_amount::text)) AS amount,
    CASE WHEN w.wallet_payment_type::text = '2'
      THEN abs(migration_support.to_numeric(w.wallet_amount::text))
      ELSE -abs(migration_support.to_numeric(w.wallet_amount::text))
    END AS delta,
    COALESCE(NULLIF(btrim(w.wallet_desc::text), ''), 'Legacy wallet transaction') AS description,
    COALESCE(
      migration_support.to_timestamp(w.wallet_cdate::text),
      migration_support.to_timestamp(w.wallet_date::text),
      now()
    ) AS created_at
  FROM legacy_mysql.tbl_wallet_history w
  JOIN legacy_mysql.tbl_users u ON u.user_id = w.user_id
  JOIN "legacy_entity_map" map
    ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id
), running AS (
  SELECT
    base.*,
    sum(delta) OVER (
      PARTITION BY target_user_id
      ORDER BY wallet_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS balance_after
  FROM base
)
INSERT INTO "wallet_transactions" (
  id, "userId", "userRole", type, source, amount, "balanceBefore", "balanceAfter",
  description, "referenceId", "referenceType", "createdAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_wallet_history:' || wallet_id),
  target_user_id,
  target_role::wallet_transactions_userrole_enum,
  transaction_type::wallet_transactions_type_enum,
  transaction_source::wallet_transactions_source_enum,
  amount,
  balance_after - delta,
  balance_after,
  description,
  wallet_id::text,
  'legacy:tbl_wallet_history',
  created_at
FROM running;

INSERT INTO "legacy_entity_map" (
  "sourceTable", "sourceId", "targetTable", "targetId", "targetKey"
)
SELECT
  'tbl_wallet_history',
  w.wallet_id,
  'wallet_transactions',
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_wallet_history:' || w.wallet_id),
  map."targetId"::text
FROM legacy_mysql.tbl_wallet_history w
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_withdrawal',
  w.w_id,
  'missing_withdrawal_user',
  'warning',
  jsonb_build_object('legacyUserId', w.user_id, 'amount', w.w_amount)
FROM legacy_mysql.tbl_withdrawal w
JOIN current_migration_run r ON true
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id
WHERE map."targetId" IS NULL;

INSERT INTO "redemptions" (
  id, "userId", "userName", role, type, points, amount, status, "upiId",
  "bankAccount", ifsc, "accountHolderName", "transactionId", "rejectionReason",
  "requestedAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_withdrawal:' || w.w_id),
  map."targetId"::text,
  COALESCE(NULLIF(btrim(u.user_name::text), ''), 'Legacy User'),
  CASE WHEN u.user_type::text = '2' THEN 'dealer' ELSE 'electrician' END::redemptions_role_enum,
  'bank_transfer',
  abs(migration_support.to_numeric(w.w_amount::text)),
  abs(migration_support.to_numeric(w.w_amount::text)),
  CASE w.w_type::text
    WHEN '2' THEN 'completed'
    WHEN '3' THEN 'rejected'
    ELSE 'pending'
  END::redemptions_status_enum,
  NULLIF(btrim(u.upiid::text), ''),
  NULLIF(btrim(u.account_number::text), ''),
  NULLIF(btrim(u.ifsc_code::text), ''),
  NULLIF(btrim(u.account_holder_name::text), ''),
  'legacy-withdrawal-' || w.w_id,
  CASE WHEN w.w_type::text = '3' THEN NULLIF(btrim(w.w_desc::text), '') ELSE NULL END,
  COALESCE(
    migration_support.to_timestamp(w.w_cdate::text),
    migration_support.to_timestamp(w.w_date::text),
    now()
  ),
  now()
FROM legacy_mysql.tbl_withdrawal w
JOIN legacy_mysql.tbl_users u ON u.user_id = w.user_id
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id;

INSERT INTO "legacy_entity_map" (
  "sourceTable", "sourceId", "targetTable", "targetId", "targetKey"
)
SELECT
  'tbl_withdrawal',
  w.w_id,
  'redemptions',
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_withdrawal:' || w.w_id),
  map."targetId"::text
FROM legacy_mysql.tbl_withdrawal w
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_user_redeem',
  ur.user_redeem_id,
  CASE WHEN map."targetId" IS NULL THEN 'missing_gift_order_user' ELSE 'missing_gift_product' END,
  'warning',
  jsonb_build_object('legacyUserId', ur.user_id, 'legacyProductId', ur.product_id)
FROM legacy_mysql.tbl_user_redeem ur
JOIN current_migration_run r ON true
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = ur.user_id
LEFT JOIN legacy_mysql.tbl_redeem_product product
  ON product.redeem_product_id = ur.product_id
WHERE map."targetId" IS NULL OR product.redeem_product_id IS NULL;

INSERT INTO "gift_orders" (
  id, "userId", "userName", "userCode", role, "giftProductId", "giftName",
  "giftImage", "pointsUsed", status, "shippingAddress", "trackingNumber",
  "courierName", "orderedAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_user_redeem:' || ur.user_redeem_id),
  map."targetId"::text,
  COALESCE(NULLIF(btrim(ur.receiver_name::text), ''), NULLIF(btrim(u.user_name::text), ''), 'Legacy User'),
  NULLIF(btrim(u.code::text), ''),
  CASE WHEN u.user_type::text = '2' THEN 'dealer' ELSE 'electrician' END::gift_orders_role_enum,
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_redeem_product:' || ur.product_id)::text,
  COALESCE(NULLIF(btrim(product.redeem_product_name::text), ''), 'Legacy Gift'),
  NULLIF(btrim(product.redeem_product_image::text), ''),
  abs(migration_support.to_numeric(ur.user_redeem_amount::text)),
  CASE ur.user_redeem_type::text
    WHEN '3' THEN 'delivered'
    WHEN '2' THEN 'shipped'
    ELSE 'pending'
  END::gift_orders_status_enum,
  NULLIF(btrim(ur.user_redeem_address::text), ''),
  NULLIF(btrim(ur.tracking_id::text), ''),
  NULLIF(btrim(ur.courier_name::text), ''),
  COALESCE(migration_support.to_timestamp(ur.user_redeem_date::text), now()),
  now()
FROM legacy_mysql.tbl_user_redeem ur
JOIN legacy_mysql.tbl_users u ON u.user_id = ur.user_id
JOIN legacy_mysql.tbl_redeem_product product ON product.redeem_product_id = ur.product_id
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = ur.user_id;

INSERT INTO "legacy_entity_map" (
  "sourceTable", "sourceId", "targetTable", "targetId", "targetKey"
)
SELECT
  'tbl_user_redeem',
  ur.user_redeem_id,
  'gift_orders',
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_user_redeem:' || ur.user_redeem_id),
  map."targetId"::text
FROM legacy_mysql.tbl_user_redeem ur
JOIN legacy_mysql.tbl_redeem_product product ON product.redeem_product_id = ur.product_id
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = ur.user_id;

WITH redemption_totals AS (
  SELECT "userId", role, count(*)::integer AS redemption_count
  FROM "redemptions"
  GROUP BY "userId", role
)
UPDATE "electricians" e
SET "totalRedemptions" = totals.redemption_count
FROM redemption_totals totals
WHERE totals.role = 'electrician' AND e.id::text = totals."userId";

WITH ledger AS (
  SELECT
    "userId",
    "userRole",
    sum(CASE WHEN type = 'credit' THEN amount ELSE -amount END) AS ledger_balance
  FROM "wallet_transactions"
  GROUP BY "userId", "userRole"
), stored AS (
  SELECT id::text AS user_id, 'electrician'::text AS user_role, "walletBalance" AS stored_balance
  FROM "electricians"
  UNION ALL
  SELECT id::text, 'dealer', bonuspoints
  FROM "dealers"
)
INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_users',
  map."sourceId",
  'wallet_balance_mismatch',
  'warning',
  jsonb_build_object(
    'targetUserId', stored.user_id,
    'storedBalance', stored.stored_balance,
    'ledgerBalance', COALESCE(ledger.ledger_balance, 0),
    'difference', stored.stored_balance - COALESCE(ledger.ledger_balance, 0)
  )
FROM stored
JOIN current_migration_run r ON true
JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users'
 AND map."targetId"::text = stored.user_id
 AND map."targetTable" = CASE WHEN stored.user_role = 'dealer' THEN 'dealers' ELSE 'electricians' END
 AND COALESCE((map.metadata->>'duplicate')::boolean, false) = false
LEFT JOIN ledger
  ON ledger."userId" = stored.user_id
 AND ledger."userRole"::text = stored.user_role
WHERE abs(stored.stored_balance - COALESCE(ledger.ledger_balance, 0)) > 0.01;

COMMIT;

ANALYZE "wallet_transactions";
ANALYZE "redemptions";
ANALYZE "gift_orders";
