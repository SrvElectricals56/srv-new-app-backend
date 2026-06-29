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

CREATE TEMP TABLE reconciliation_legacy_users ON COMMIT DROP AS
SELECT
  map."targetId",
  map."targetTable",
  source.*,
  count(*) OVER (
    PARTITION BY source.user_type, upper(btrim(source.dealer_code::text))
  ) AS dealer_code_count
FROM "legacy_entity_map" map
JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
WHERE map."sourceTable" = 'tbl_users'
  AND map."targetTable" IN ('dealers', 'electricians')
  AND map."sourceId" = COALESCE(
    NULLIF(map.metadata ->> 'canonicalSourceId', '')::bigint,
    map."sourceId"
  );

CREATE TEMP TABLE reconciliation_results (
  check_name text PRIMARY KEY,
  expected numeric NOT NULL,
  actual numeric NOT NULL,
  hard_failure boolean NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO reconciliation_results VALUES
  ('legacy_users_accounted',
    (SELECT count(*) FROM legacy_mysql.tbl_users),
    (SELECT count(*) FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_users'),
    true),
  ('canonical_users_created',
    (SELECT count(*) FROM (
      SELECT user_type,
             CASE WHEN length(regexp_replace(COALESCE(phone::text, ''), '\D', '', 'g')) >= 10
               THEN right(regexp_replace(phone::text, '\D', '', 'g'), 10)
               ELSE 'legacy-' || user_id::text END AS normalized_phone
      FROM legacy_mysql.tbl_users
      WHERE user_type::text IN ('1', '2')
      GROUP BY user_type, normalized_phone
    ) canonical),
    (SELECT count(*) FROM "electricians") + (SELECT count(*) FROM "dealers"),
    true),
  ('legacy_dealer_codes_preserved',
    (SELECT count(*) FROM reconciliation_legacy_users source
     WHERE source."targetTable" = 'dealers'
       AND NULLIF(btrim(source.dealer_code::text), '') IS NOT NULL
       AND source.dealer_code_count = 1),
    (SELECT count(*)
     FROM reconciliation_legacy_users source
     JOIN "dealers" dealer ON dealer.id = source."targetId"
     WHERE source."targetTable" = 'dealers'
       AND NULLIF(btrim(source.dealer_code::text), '') IS NOT NULL
       AND source.dealer_code_count = 1
       AND upper(dealer."dealerCode") = upper(btrim(source.dealer_code::text))),
    true),
  ('legacy_electrician_codes_preserved',
    (SELECT count(*) FROM reconciliation_legacy_users source
     WHERE source."targetTable" = 'electricians'
       AND NULLIF(btrim(source.dealer_code::text), '') IS NOT NULL
       AND source.dealer_code_count = 1),
    (SELECT count(*)
     FROM reconciliation_legacy_users source
     JOIN "electricians" electrician ON electrician.id = source."targetId"
     WHERE source."targetTable" = 'electricians'
       AND NULLIF(btrim(source.dealer_code::text), '') IS NOT NULL
       AND source.dealer_code_count = 1
       AND upper(electrician."electricianCode") = upper(btrim(source.dealer_code::text))),
    true),
  ('legacy_electrician_dealer_links',
    (SELECT count(*)
     FROM reconciliation_legacy_users electrician
     JOIN reconciliation_legacy_users dealer
       ON dealer."targetTable" = 'dealers'
      AND dealer.dealer_code_count = 1
      AND upper(btrim(dealer.dealer_code::text)) = upper(btrim(electrician.sells_code::text))
     WHERE electrician."targetTable" = 'electricians'
       AND NULLIF(btrim(electrician.sells_code::text), '') IS NOT NULL),
    (SELECT count(*)
     FROM reconciliation_legacy_users electrician
     JOIN reconciliation_legacy_users dealer
       ON dealer."targetTable" = 'dealers'
      AND dealer.dealer_code_count = 1
      AND upper(btrim(dealer.dealer_code::text)) = upper(btrim(electrician.sells_code::text))
     JOIN "electricians" target
       ON target.id = electrician."targetId" AND target."dealerId" = dealer."targetId"
     WHERE electrician."targetTable" = 'electricians'
       AND NULLIF(btrim(electrician.sells_code::text), '') IS NOT NULL),
    true),
  ('products_migrated',
    (SELECT count(*) FROM legacy_mysql.tbl_product),
    (SELECT count(*) FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_product'),
    true),
  ('product_variants_migrated',
    (SELECT count(*) FROM legacy_mysql.tbl_product_variant),
    (SELECT count(*) FROM "product_variants"),
    true),
  ('gift_products_migrated',
    (SELECT count(*) FROM legacy_mysql.tbl_redeem_product),
    (SELECT count(*) FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_redeem_product'),
    true),
  ('qr_total',
    (SELECT count(*) FROM legacy_mysql.tbl_redeem_codes_details),
    (SELECT count(*) FROM "qr_codes"),
    true),
  ('qr_pending',
    (SELECT count(*) FROM legacy_mysql.tbl_redeem_codes_details WHERE qr_code_status::text = '0'),
    (SELECT count(*) FROM "qr_codes" WHERE "isScanned" = false),
    true),
  ('qr_redeemed',
    (SELECT count(*) FROM legacy_mysql.tbl_redeem_codes_details WHERE qr_code_status::text = '1'),
    (SELECT count(*) FROM "qr_codes" WHERE "isScanned" = true),
    true),
  ('qr_unique_codes',
    (SELECT count(DISTINCT qr_code) FROM legacy_mysql.tbl_redeem_codes_details),
    (SELECT count(DISTINCT code) FROM "qr_codes"),
    true),
  ('qr_reward_total',
    (SELECT sum(migration_support.to_numeric(qr_code_price::text)) FROM legacy_mysql.tbl_redeem_codes_details),
    (SELECT sum("rewardPoints") FROM "qr_codes"),
    true),
  ('scans_for_linked_redeemed_qr',
    (SELECT count(*)
     FROM legacy_mysql.tbl_redeem_codes_details q
     JOIN "legacy_entity_map" map
       ON map."sourceTable" = 'tbl_users' AND map."sourceId" = q.qr_code_redeem_user_id
     WHERE q.qr_code_status::text = '1'),
    (SELECT count(*) FROM "scans"),
    true),
  ('wallet_rows_accounted',
    (SELECT count(*) FROM legacy_mysql.tbl_wallet_history),
    (SELECT count(*) FROM "wallet_transactions") +
      (SELECT count(*) FROM "legacy_import_exceptions"
       WHERE "migrationRunId" = (SELECT id FROM current_migration_run)
         AND "sourceTable" = 'tbl_wallet_history'
         AND "exceptionType" = 'missing_wallet_user'),
    true),
  ('withdrawals_accounted',
    (SELECT count(*) FROM legacy_mysql.tbl_withdrawal),
    (SELECT count(*) FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_withdrawal') +
      (SELECT count(*) FROM "legacy_import_exceptions"
       WHERE "migrationRunId" = (SELECT id FROM current_migration_run)
         AND "sourceTable" = 'tbl_withdrawal'
         AND "exceptionType" = 'missing_withdrawal_user'),
    true),
  ('gift_orders_accounted',
    (SELECT count(*) FROM legacy_mysql.tbl_user_redeem),
    (SELECT count(*) FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_user_redeem') +
      (SELECT count(*) FROM "legacy_import_exceptions"
       WHERE "migrationRunId" = (SELECT id FROM current_migration_run)
         AND "sourceTable" = 'tbl_user_redeem'
         AND "exceptionType" IN ('missing_gift_order_user', 'missing_gift_product')),
    true),
  ('wallet_credit_total_linked',
    (SELECT COALESCE(sum(abs(migration_support.to_numeric(w.wallet_amount::text))), 0)
     FROM legacy_mysql.tbl_wallet_history w
     JOIN "legacy_entity_map" map
       ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id
     WHERE w.wallet_payment_type::text = '2'),
    (SELECT COALESCE(sum(amount), 0) FROM "wallet_transactions" WHERE type = 'credit'),
    true),
  ('wallet_debit_total_linked',
    (SELECT COALESCE(sum(abs(migration_support.to_numeric(w.wallet_amount::text))), 0)
     FROM legacy_mysql.tbl_wallet_history w
     JOIN "legacy_entity_map" map
       ON map."sourceTable" = 'tbl_users' AND map."sourceId" = w.user_id
     WHERE w.wallet_payment_type::text <> '2'),
    (SELECT COALESCE(sum(amount), 0) FROM "wallet_transactions" WHERE type = 'debit'),
    true),
  ('wallet_balance_mismatches',
    0,
    (SELECT count(*) FROM "legacy_import_exceptions"
     WHERE "migrationRunId" = (SELECT id FROM current_migration_run)
       AND "exceptionType" = 'wallet_balance_mismatch'),
    false);

UPDATE "migration_runs" m
SET
  "targetCounts" = jsonb_build_object(
    'electricians', (SELECT count(*) FROM "electricians"),
    'dealers', (SELECT count(*) FROM "dealers"),
    'products', (SELECT count(*) FROM "products"),
    'productVariants', (SELECT count(*) FROM "product_variants"),
    'qrCodes', (SELECT count(*) FROM "qr_codes"),
    'scans', (SELECT count(*) FROM "scans"),
    'walletTransactions', (SELECT count(*) FROM "wallet_transactions"),
    'redemptions', (SELECT count(*) FROM "redemptions"),
    'giftOrders', (SELECT count(*) FROM "gift_orders")
  ),
  reconciliation = (
    SELECT jsonb_object_agg(
      check_name,
      jsonb_build_object(
        'expected', expected,
        'actual', actual,
        'passed', expected = actual,
        'hardFailure', hard_failure
      )
    )
    FROM reconciliation_results
  ),
  status = CASE
    WHEN EXISTS (
      SELECT 1 FROM reconciliation_results
      WHERE hard_failure AND expected <> actual
    ) THEN 'failed'
    ELSE 'completed'
  END,
  "completedAt" = now()
WHERE m.id = (SELECT id FROM current_migration_run);

DO $$
DECLARE
  failures text;
BEGIN
  SELECT string_agg(
    format('%s expected=%s actual=%s', check_name, expected, actual),
    '; '
  )
  INTO failures
  FROM reconciliation_results
  WHERE hard_failure AND expected <> actual;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'migration reconciliation failed: %', failures;
  END IF;
END $$;

SELECT check_name, expected, actual, expected = actual AS passed, hard_failure
FROM reconciliation_results
ORDER BY check_name;

COMMIT;
