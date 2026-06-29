\set ON_ERROR_STOP on

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('srv-legacy-migration'));

CREATE TEMP TABLE legacy_electricians_ranked ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    u.*,
    CASE
      WHEN length(regexp_replace(COALESCE(u.phone::text, ''), '\D', '', 'g')) >= 10
        THEN right(regexp_replace(u.phone::text, '\D', '', 'g'), 10)
      ELSE 'legacy-' || u.user_id::text
    END AS normalized_phone
  FROM legacy_mysql.tbl_users u
  WHERE u.user_type::text = '1'
), ranked AS (
  SELECT
    normalized.*,
    row_number() OVER (
      PARTITION BY user_type, normalized_phone
      ORDER BY (status::text = '1') DESC, user_id DESC
    ) AS canonical_rank
  FROM normalized
), canonical AS (
  SELECT
    ranked.*,
    count(*) OVER (PARTITION BY upper(btrim(code::text))) AS code_count
  FROM ranked
  WHERE canonical_rank = 1
)
SELECT * FROM canonical;

INSERT INTO "electricians" (
  id, name, phone, "electricianCode", email, "profileImage", city, state,
  district, pincode, address, "subCategory", tier, "totalPoints", "totalScans",
  "walletBalance", "totalRedemptions", status, "bankLinked", "upiId",
  "bankAccount", ifsc, "bankName", "accountHolderName", "kycStatus",
  "aadharNumber", "panNumber", "aadharFrontImage", "panDocument", "gstDocument",
  "fallbackDealerPhone", "joinedDate", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:electrician:' || u.user_id),
  COALESCE(NULLIF(btrim(u.user_name::text), ''), 'Legacy Electrician ' || u.user_id),
  u.normalized_phone,
  CASE
    WHEN NULLIF(btrim(u.code::text), '') IS NOT NULL AND u.code_count = 1
      THEN upper(btrim(u.code::text))
    ELSE 'LEGACY-ELC-' || u.user_id
  END,
  NULLIF(btrim(u.email::text), ''),
  NULLIF(btrim(u.imageurl::text), ''),
  COALESCE(NULLIF(btrim(u.city::text), ''), 'Unknown'),
  COALESCE(NULLIF(btrim(u.state::text), ''), 'Unknown'),
  COALESCE(NULLIF(btrim(u.district::text), ''), 'Unknown'),
  NULLIF(btrim(u.pincode::text), ''),
  NULLIF(btrim(u.address::text), ''),
  'General Electrician'::electricians_subcategory_enum,
  'Silver'::electricians_tier_enum,
  0,
  0,
  migration_support.to_numeric(u.wallet::text),
  0,
  CASE WHEN u.status::text = '1' THEN 'active' ELSE 'inactive' END::electricians_status_enum,
  (u.bank_status::text = '2'),
  NULLIF(btrim(u.upiid::text), ''),
  NULLIF(btrim(u.account_number::text), ''),
  NULLIF(btrim(u.ifsc_code::text), ''),
  NULLIF(btrim(u.bank_name::text), ''),
  NULLIF(btrim(u.account_holder_name::text), ''),
  CASE u.kyc_status::text
    WHEN '2' THEN 'verified'
    WHEN '1' THEN 'pending'
    ELSE 'not_submitted'
  END::electricians_kycstatus_enum,
  NULL,
  NULLIF(btrim(u.pan_card::text), ''),
  NULLIF(btrim(u.adharcard_front::text), ''),
  NULLIF(btrim(u.pan_card::text), ''),
  NULLIF(btrim(u.document::text), ''),
  NULLIF(btrim(u.dealer_code::text), ''),
  COALESCE(u.created_at, now()),
  now()
FROM legacy_electricians_ranked u
WHERE NOT EXISTS (
  SELECT 1 FROM "electricians" e
  WHERE e.id = uuid_generate_v5(
    uuid_ns_url(), 'srv:legacy:tbl_users:electrician:' || u.user_id
  )
);

UPDATE "electricians" e
SET "dealerId" = d.id,
    "fallbackDealerPhone" = NULL
FROM legacy_electricians_ranked source_e
JOIN legacy_mysql.tbl_users source_d
  ON source_d.user_type::text = '2'
 AND upper(btrim(source_d.code::text)) = upper(btrim(source_e.dealer_code::text))
JOIN "legacy_entity_map" map_d
  ON map_d."sourceTable" = 'tbl_users'
 AND map_d."sourceId" = source_d.user_id
 AND map_d."targetTable" = 'dealers'
JOIN "dealers" d ON d.id = map_d."targetId"
WHERE e.id = uuid_generate_v5(
  uuid_ns_url(), 'srv:legacy:tbl_users:electrician:' || source_e.user_id
);

WITH user_scan_totals AS (
  SELECT "userId", count(*)::integer AS scan_count, sum(points) AS total_points
  FROM "scans"
  WHERE role = 'electrician'
  GROUP BY "userId"
)
UPDATE "electricians" e
SET "totalScans" = totals.scan_count,
    "totalPoints" = totals.total_points
FROM user_scan_totals totals
WHERE e.id::text = totals."userId";

COMMIT;
