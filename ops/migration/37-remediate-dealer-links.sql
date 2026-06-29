\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('srv-legacy-migration'));

DO $$
BEGIN
  IF to_regclass('legacy_mysql.tbl_users') IS NULL THEN
    RAISE EXCEPTION 'legacy_mysql source schema is not loaded';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'electricians'
      AND column_name = 'fallbackDealerCode'
  ) THEN
    RAISE EXCEPTION 'fallbackDealerCode migration has not been applied';
  END IF;
END $$;

CREATE TEMP TABLE canonical_legacy_users ON COMMIT DROP AS
SELECT
  map."targetId",
  map."targetTable",
  source.*,
  count(*) OVER (
    PARTITION BY source.user_type, upper(btrim(source.dealer_code::text))
  ) AS dealer_code_count
FROM "legacy_entity_map" map
JOIN legacy_mysql.tbl_users source
  ON source.user_id = map."sourceId"
WHERE map."sourceTable" = 'tbl_users'
  AND map."targetTable" IN ('dealers', 'electricians')
  AND map."sourceId" = COALESCE(
    NULLIF(map.metadata ->> 'canonicalSourceId', '')::bigint,
    map."sourceId"
  );

UPDATE "dealers" dealer
SET "dealerCode" = CASE
  WHEN NULLIF(btrim(source.dealer_code::text), '') IS NOT NULL
   AND source.dealer_code_count = 1
   AND NOT EXISTS (
     SELECT 1 FROM "dealers" other
     WHERE other.id <> dealer.id
       AND upper(other."dealerCode") = upper(btrim(source.dealer_code::text))
   )
    THEN upper(btrim(source.dealer_code::text))
  ELSE 'LEGACY-DLR-' || source.user_id
END
FROM canonical_legacy_users source
WHERE source."targetTable" = 'dealers'
  AND dealer.id = source."targetId";

UPDATE "electricians" electrician
SET "electricianCode" = CASE
      WHEN NULLIF(btrim(source.dealer_code::text), '') IS NOT NULL
       AND source.dealer_code_count = 1
       AND NOT EXISTS (
         SELECT 1 FROM "electricians" other
         WHERE other.id <> electrician.id
           AND upper(other."electricianCode") = upper(btrim(source.dealer_code::text))
       )
        THEN upper(btrim(source.dealer_code::text))
      ELSE 'LEGACY-ELC-' || source.user_id
    END,
    "dealerId" = NULL,
    "fallbackDealerPhone" = NULL,
    "fallbackDealerCode" = NULLIF(btrim(source.sells_code::text), '')
FROM canonical_legacy_users source
WHERE source."targetTable" = 'electricians'
  AND electrician.id = source."targetId";

WITH canonical_dealers AS (
  SELECT *, count(*) OVER (
    PARTITION BY upper(btrim(dealer_code::text))
  ) AS parent_code_count
  FROM canonical_legacy_users
  WHERE "targetTable" = 'dealers'
    AND NULLIF(btrim(dealer_code::text), '') IS NOT NULL
), linked AS (
  SELECT electrician."targetId" AS electrician_id,
         dealer."targetId" AS dealer_id
  FROM canonical_legacy_users electrician
  JOIN canonical_dealers dealer
    ON dealer.parent_code_count = 1
   AND upper(btrim(dealer.dealer_code::text)) = upper(btrim(electrician.sells_code::text))
  WHERE electrician."targetTable" = 'electricians'
    AND NULLIF(btrim(electrician.sells_code::text), '') IS NOT NULL
)
UPDATE "electricians" electrician
SET "dealerId" = linked.dealer_id,
    "fallbackDealerCode" = NULL
FROM linked
WHERE electrician.id = linked.electrician_id;

WITH counts AS (
  SELECT dealer.id, count(electrician.id)::integer AS electrician_count
  FROM "dealers" dealer
  LEFT JOIN "electricians" electrician ON electrician."dealerId" = dealer.id
  GROUP BY dealer.id
)
UPDATE "dealers" dealer
SET "electricianCount" = counts.electrician_count,
    tier = CASE
      WHEN counts.electrician_count >= 501 THEN 'Diamond'::dealers_tier_enum
      WHEN counts.electrician_count >= 301 THEN 'Platinum'::dealers_tier_enum
      WHEN counts.electrician_count >= 101 THEN 'Gold'::dealers_tier_enum
      ELSE 'Silver'::dealers_tier_enum
    END
FROM counts
WHERE dealer.id = counts.id;

UPDATE "legacy_entity_map" map
SET metadata = map.metadata || jsonb_build_object(
  'legacyDealerCode', NULLIF(btrim(source.dealer_code::text), ''),
  'legacyParentDealerCode', NULLIF(btrim(source.sells_code::text), '')
)
FROM legacy_mysql.tbl_users source
WHERE map."sourceTable" = 'tbl_users'
  AND map."sourceId" = source.user_id;

WITH latest_run AS (
  SELECT id FROM "migration_runs" ORDER BY "startedAt" DESC LIMIT 1
), unmatched AS (
  SELECT electrician.user_id, btrim(electrician.sells_code::text) AS parent_code
  FROM canonical_legacy_users electrician
  WHERE electrician."targetTable" = 'electricians'
    AND NULLIF(btrim(electrician.sells_code::text), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM canonical_legacy_users dealer
      WHERE dealer."targetTable" = 'dealers'
        AND upper(btrim(dealer.dealer_code::text)) = upper(btrim(electrician.sells_code::text))
    )
)
INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT latest_run.id, 'tbl_users', unmatched.user_id,
       'unmatched_legacy_parent_dealer_code', 'warning',
       jsonb_build_object('legacyParentDealerCode', unmatched.parent_code)
FROM unmatched
CROSS JOIN latest_run
WHERE NOT EXISTS (
  SELECT 1 FROM "legacy_import_exceptions" existing
  WHERE existing."migrationRunId" = latest_run.id
    AND existing."sourceTable" = 'tbl_users'
    AND existing."sourceId" = unmatched.user_id
    AND existing."exceptionType" = 'unmatched_legacy_parent_dealer_code'
);

COMMIT;

SELECT count(*) AS linked_legacy_electricians
FROM "electricians"
WHERE "dealerId" IS NOT NULL;

SELECT count(DISTINCT "fallbackDealerCode") AS unmatched_legacy_parent_codes
FROM "electricians"
WHERE "dealerId" IS NULL AND "fallbackDealerCode" IS NOT NULL;
