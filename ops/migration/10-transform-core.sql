\set ON_ERROR_STOP on
\if :{?source_file}
\else
  \set source_file 'unknown.sql.gz'
\endif
\if :{?source_sha256}
\else
  \set source_sha256 'unknown'
\endif

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('srv-legacy-migration'));

DO $$
BEGIN
  IF to_regclass('legacy_mysql.tbl_users') IS NULL THEN
    RAISE EXCEPTION 'legacy_mysql source schema is not loaded';
  END IF;
  IF EXISTS (SELECT 1 FROM "migration_runs" WHERE status = 'running') THEN
    RAISE EXCEPTION 'another migration run is already marked running';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "electricians" UNION ALL
    SELECT 1 FROM "dealers" UNION ALL
    SELECT 1 FROM "products" UNION ALL
    SELECT 1 FROM "qr_codes"
  ) THEN
    RAISE EXCEPTION 'target application tables are not empty';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS migration_support;

CREATE OR REPLACE FUNCTION migration_support.to_numeric(value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN btrim(COALESCE(value, '')) ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN btrim(value)::numeric
    ELSE 0::numeric
  END
$$;

CREATE OR REPLACE FUNCTION migration_support.to_timestamp(value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' OR value LIKE '0000-00-00%' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN value::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END
$$;

INSERT INTO "migration_runs" (
  "sourceFile", "sourceSha256", "sourceCreatedAt", status, notes
)
VALUES (
  :'source_file', :'source_sha256', now(), 'running',
  'Rehearsal migration from raw legacy_mysql schema'
);

CREATE TEMP TABLE current_migration_run ON COMMIT DROP AS
SELECT id FROM "migration_runs" WHERE status = 'running' ORDER BY "startedAt" DESC LIMIT 1;

CREATE TEMP TABLE legacy_users_ranked ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    u.*,
    CASE
      WHEN length(regexp_replace(COALESCE(u.phone::text, ''), '\D', '', 'g')) >= 10
        THEN right(regexp_replace(u.phone::text, '\D', '', 'g'), 10)
      ELSE 'legacy-' || u.user_id::text
    END AS normalized_phone
  FROM legacy_mysql.tbl_users u
), ranked AS (
  SELECT
    normalized.*,
    row_number() OVER (
      PARTITION BY user_type, normalized_phone
      ORDER BY (status::text = '1') DESC, user_id DESC
    ) AS canonical_rank
  FROM normalized
)
SELECT * FROM ranked;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_users',
  u.user_id,
  'same_role_duplicate_phone',
  'warning',
  jsonb_build_object(
    'userType', u.user_type,
    'normalizedPhone', u.normalized_phone,
    'canonicalUserId', canonical.user_id
  )
FROM legacy_users_ranked u
JOIN current_migration_run r ON true
JOIN legacy_users_ranked canonical
  ON canonical.user_type = u.user_type
 AND canonical.normalized_phone = u.normalized_phone
 AND canonical.canonical_rank = 1
WHERE u.canonical_rank > 1;

INSERT INTO "legacy_import_exceptions" (
  "migrationRunId", "sourceTable", "sourceId", "exceptionType", severity, details
)
SELECT
  r.id,
  'tbl_users',
  u.user_id,
  'invalid_phone',
  'warning',
  jsonb_build_object('sourcePhone', u.phone)
FROM legacy_users_ranked u
JOIN current_migration_run r ON true
WHERE u.normalized_phone LIKE 'legacy-%';

INSERT INTO "dealers" (
  id, name, phone, "dealerCode", email, "profileImage", town, district, state,
  address, pincode, "gstNumber", tier, "electricianCount", status,
  "bankLinked", "upiId", "bankAccount", ifsc, "bankName", "accountHolderName",
  "kycStatus", "aadharNumber", "panNumber", "aadharFrontImage", "panDocument",
  "gstDocument", "walletBalance", bonuspoints, "joinedDate", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:dealer:' || u.user_id),
  COALESCE(NULLIF(btrim(u.user_name::text), ''), 'Legacy Dealer ' || u.user_id),
  u.normalized_phone,
  CASE
    WHEN NULLIF(btrim(u.dealer_code::text), '') IS NOT NULL
     AND count(*) OVER (PARTITION BY upper(btrim(u.dealer_code::text))) = 1
      THEN upper(btrim(u.dealer_code::text))
    ELSE 'LEGACY-DLR-' || u.user_id
  END,
  NULLIF(btrim(u.email::text), ''),
  NULLIF(btrim(u.imageurl::text), ''),
  COALESCE(NULLIF(btrim(u.city::text), ''), 'Unknown'),
  COALESCE(NULLIF(btrim(u.district::text), ''), 'Unknown'),
  COALESCE(NULLIF(btrim(u.state::text), ''), 'Unknown'),
  COALESCE(NULLIF(btrim(u.address::text), ''), 'Legacy address unavailable'),
  NULLIF(btrim(u.pincode::text), ''),
  NULLIF(btrim(u.gst_number::text), ''),
  'Silver'::dealers_tier_enum,
  0,
  CASE WHEN u.status::text = '1' THEN 'active' ELSE 'inactive' END::dealers_status_enum,
  (u.bank_status::text = '2'),
  NULLIF(btrim(u.upiid::text), ''),
  NULLIF(btrim(u.account_number::text), ''),
  NULLIF(btrim(u.ifsc_code::text), ''),
  NULLIF(btrim(u.bank_name::text), ''),
  NULLIF(btrim(u.account_holder_name::text), ''),
  CASE u.kyc_status::text
    WHEN '2' THEN 'verified'
    WHEN '1' THEN 'pending'
    WHEN '0' THEN 'rejected'
    ELSE 'not_submitted'
  END::dealers_kycstatus_enum,
  NULL,
  NULLIF(btrim(u.pan_card::text), ''),
  NULLIF(btrim(u.adharcard_front::text), ''),
  NULLIF(btrim(u.pan_card::text), ''),
  NULLIF(btrim(u.document::text), ''),
  0,
  migration_support.to_numeric(u.wallet::text),
  COALESCE(u.created_at, now()),
  now()
FROM legacy_users_ranked u
WHERE u.user_type::text = '2' AND u.canonical_rank = 1;

INSERT INTO "electricians" (
  id, name, phone, "electricianCode", email, "profileImage", city, state,
  district, pincode, address, "subCategory", tier, "totalPoints", "totalScans",
  "walletBalance", "totalRedemptions", status, "bankLinked", "upiId",
  "bankAccount", ifsc, "bankName", "accountHolderName", "kycStatus",
  "aadharNumber", "panNumber", "aadharFrontImage", "panDocument", "gstDocument",
  "fallbackDealerPhone", "fallbackDealerCode", "joinedDate", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:electrician:' || u.user_id),
  COALESCE(NULLIF(btrim(u.user_name::text), ''), 'Legacy Electrician ' || u.user_id),
  u.normalized_phone,
  CASE
    WHEN NULLIF(btrim(u.dealer_code::text), '') IS NOT NULL
     AND count(*) OVER (PARTITION BY upper(btrim(u.dealer_code::text))) = 1
      THEN upper(btrim(u.dealer_code::text))
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
    WHEN '0' THEN 'rejected'
    ELSE 'not_submitted'
  END::electricians_kycstatus_enum,
  NULL,
  NULLIF(btrim(u.pan_card::text), ''),
  NULLIF(btrim(u.adharcard_front::text), ''),
  NULLIF(btrim(u.pan_card::text), ''),
  NULLIF(btrim(u.document::text), ''),
  NULL,
  CASE
    WHEN lower(btrim(COALESCE(u.sells_code::text, ''))) IN ('', 'undefined', 'null', 'n/a') THEN NULL
    ELSE btrim(u.sells_code::text)
  END,
  COALESCE(u.created_at, now()),
  now()
FROM legacy_users_ranked u
WHERE u.user_type::text = '1' AND u.canonical_rank = 1;

INSERT INTO "legacy_entity_map" (
  "sourceTable", "sourceId", "targetTable", "targetId", "targetKey", metadata
)
SELECT
  'tbl_users',
  u.user_id,
  CASE WHEN u.user_type::text = '2' THEN 'dealers' ELSE 'electricians' END,
  CASE WHEN u.user_type::text = '2'
    THEN uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:dealer:' || canonical.user_id)
    ELSE uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_users:electrician:' || canonical.user_id)
  END,
  u.normalized_phone,
  jsonb_build_object(
    'canonicalSourceId', canonical.user_id,
    'duplicate', u.canonical_rank > 1,
    'userType', u.user_type,
    'legacyDealerCode', NULLIF(btrim(u.dealer_code::text), ''),
    'legacyParentDealerCode', CASE
      WHEN lower(btrim(COALESCE(u.sells_code::text, ''))) IN ('', 'undefined', 'null', 'n/a') THEN NULL
      ELSE btrim(u.sells_code::text)
    END
  )
FROM legacy_users_ranked u
JOIN legacy_users_ranked canonical
  ON canonical.user_type = u.user_type
 AND canonical.normalized_phone = u.normalized_phone
 AND canonical.canonical_rank = 1
WHERE u.user_type::text IN ('1', '2');

UPDATE "electricians" e
SET "dealerId" = d.id,
    "fallbackDealerPhone" = NULL,
    "fallbackDealerCode" = NULL
FROM legacy_users_ranked source_e
JOIN "legacy_entity_map" map_e
  ON map_e."sourceTable" = 'tbl_users'
 AND map_e."sourceId" = source_e.user_id
 AND map_e."targetTable" = 'electricians'
JOIN legacy_users_ranked source_d
  ON source_d.user_type::text = '2'
 AND source_d.canonical_rank = 1
 AND lower(btrim(COALESCE(source_e.sells_code::text, ''))) NOT IN ('', 'undefined', 'null', 'n/a')
 AND upper(btrim(source_d.dealer_code::text)) = upper(btrim(source_e.sells_code::text))
JOIN "legacy_entity_map" map_d
  ON map_d."sourceTable" = 'tbl_users'
 AND map_d."sourceId" = source_d.user_id
 AND map_d."targetTable" = 'dealers'
JOIN "dealers" d ON d.id = map_d."targetId"
WHERE e.id = map_e."targetId"
  AND source_e.canonical_rank = 1;

INSERT INTO "product_categories" (
  id, label, glyph, "imageUrl", "sortOrder", "isActive", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_category:' || c.category_id),
  COALESCE(NULLIF(btrim(c.category_name::text), ''), 'Legacy Category ' || c.category_id),
  NULL,
  NULLIF(btrim(c.category_image::text), ''),
  c.category_id,
  c.category_status::text = '1',
  now(),
  now()
FROM legacy_mysql.tbl_category c;

WITH variant_summary AS (
  SELECT
    v.product_id,
    min(NULLIF(v.pv_dis_price, 0)) AS min_price,
    min(NULLIF(v.pv_ori_price, 0)) AS min_mrp,
    sum(GREATEST(COALESCE(v.pv_stock, 0), 0)) AS stock
  FROM legacy_mysql.tbl_product_variant v
  GROUP BY v.product_id
), reward_summary AS (
  SELECT
    q.p_id,
    max(migration_support.to_numeric(q.qr_price::text)) AS reward_points
  FROM legacy_mysql.tbl_redeem_codes q
  GROUP BY q.p_id
), products_ranked AS (
  SELECT
    p.*,
    count(*) OVER (PARTITION BY upper(btrim(p.product_batch_no::text))) AS batch_count
  FROM legacy_mysql.tbl_product p
)
INSERT INTO "products" (
  id, name, sub, category, "subCategory", image, points, badge, price, mrp,
  stock, "totalScanned", sku, weight, description, "isActive", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product:' || p.product_id),
  COALESCE(NULLIF(btrim(p.product_name::text), ''), 'Legacy Product ' || p.product_id),
  COALESCE(NULLIF(btrim(p.product_short_desc::text), ''), NULLIF(btrim(p.product_name::text), ''), 'Legacy Product'),
  COALESCE(NULLIF(btrim(c.category_name::text), ''), 'Legacy Uncategorized'),
  NULL,
  NULLIF(btrim(p.product_image::text), ''),
  COALESCE(rs.reward_points, 0),
  NULLIF(btrim(p.product_batch_no::text), ''),
  COALESCE(vs.min_price, vs.min_mrp, 0),
  vs.min_mrp,
  COALESCE(vs.stock, 0),
  0,
  CASE
    WHEN NULLIF(btrim(p.product_batch_no::text), '') IS NOT NULL AND p.batch_count = 1
      THEN btrim(p.product_batch_no::text)
    ELSE 'LEGACY-PROD-' || p.product_id
  END,
  NULL,
  concat_ws(E'\n\n', NULLIF(p.product_long_desc::text, ''), NULLIF(p.product_desc::text, ''), NULLIF(p.how_to_use::text, '')),
  p.product_status::text = '1',
  now(),
  now()
FROM products_ranked p
LEFT JOIN legacy_mysql.tbl_category c ON c.category_id = p.category_id
LEFT JOIN variant_summary vs ON vs.product_id = p.product_id
LEFT JOIN reward_summary rs ON rs.p_id = p.product_id;

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
  v.pv_status::text = '1'
FROM legacy_mysql.tbl_product_variant v
JOIN legacy_mysql.tbl_product p ON p.product_id = v.product_id;

INSERT INTO "products" (
  id, name, sub, category, "subCategory", image, points, price, mrp, stock,
  "totalScanned", sku, description, "isActive", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_redeem_product:' || g.redeem_product_id),
  COALESCE(NULLIF(btrim(g.redeem_product_name::text), ''), 'Legacy Gift ' || g.redeem_product_id),
  COALESCE(NULLIF(btrim(g.redeem_product_desc::text), ''), 'Legacy reward gift'),
  'gift',
  CASE WHEN g.redeem_user_type::text = '2' THEN 'dealer' ELSE 'electrician' END,
  NULLIF(btrim(g.redeem_product_image::text), ''),
  migration_support.to_numeric(g.redeem_product_point::text),
  migration_support.to_numeric(g.redeem_product_mrp::text),
  migration_support.to_numeric(g.redeem_product_mrp::text),
  0,
  0,
  'LEGACY-GIFT-' || g.redeem_product_id,
  NULLIF(btrim(g.redeem_product_desc::text), ''),
  g.redeem_product_status::text = '1',
  now(),
  now()
FROM legacy_mysql.tbl_redeem_product g;

INSERT INTO "legacy_entity_map" (
  "sourceTable", "sourceId", "targetTable", "targetId", "targetKey"
)
SELECT 'tbl_product', p.product_id, 'products',
       uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product:' || p.product_id),
       p.product_name::text
FROM legacy_mysql.tbl_product p
UNION ALL
SELECT 'tbl_product_variant', v.pv_id, 'product_variants',
       uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_product_variant:' || v.pv_id),
       v.product_id::text
FROM legacy_mysql.tbl_product_variant v
UNION ALL
SELECT 'tbl_redeem_product', g.redeem_product_id, 'products',
       uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_redeem_product:' || g.redeem_product_id),
       g.redeem_product_name::text
FROM legacy_mysql.tbl_redeem_product g;

INSERT INTO "banners" (
  id, title, "imageUrl", "isActive", "displayOrder", status, "order", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_banner:' || b.b_id),
  COALESCE(NULLIF(btrim(b.b_name::text), ''), 'Legacy Banner ' || b.b_id),
  NULLIF(btrim(b.b_image::text), ''),
  b.b_status::text = '1',
  b.b_id,
  CASE WHEN b.b_status::text = '1' THEN 'active' ELSE 'inactive' END,
  b.b_id,
  now(),
  now()
FROM legacy_mysql.tbl_banner b;

INSERT INTO "testimonials" (
  id, "personName", quote, rating, "imageUrl", "isActive", "displayOrder", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_testimonial:' || t.testimonial_id),
  COALESCE(NULLIF(btrim(t.testimonial_name::text), ''), 'Legacy User'),
  COALESCE(NULLIF(btrim(t.testimonial_review::text), ''), 'SRV Electricals customer'),
  LEAST(5, GREATEST(0, migration_support.to_numeric(t.testimonial_rate::text))),
  NULLIF(btrim(t.testimonial_image::text), ''),
  t.testimonial_status::text = '1',
  t.testimonial_id,
  now(),
  now()
FROM legacy_mysql.tbl_testimonial t;

INSERT INTO "offers" (
  id, title, description, "validFrom", "validTo", status, "imageUrl", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_offer:' || o.offer_id),
  COALESCE(NULLIF(btrim(o.offer_name::text), ''), 'Legacy Offer ' || o.offer_id),
  COALESCE(NULLIF(btrim(o.offer_name::text), ''), 'Legacy offer'),
  current_date,
  current_date + 3650,
  CASE WHEN o.offer_status::text = '1' THEN 'active' ELSE 'inactive' END::offers_status_enum,
  NULLIF(btrim(o.offer_image::text), ''),
  now(),
  now()
FROM legacy_mysql.tbl_offer o;

INSERT INTO "notifications" (
  id, title, message, "targetUserIds", status, "sentAt", "imageUrl", "actionUrl", "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_notification:' || n.id),
  COALESCE(NULLIF(btrim(n.tittle::text), ''), 'SRV Electricals'),
  COALESCE(NULLIF(btrim(n.msg::text), ''), 'Notification'),
  CASE WHEN n.type::text = '1' AND n.user_id IS NOT NULL
    THEN ARRAY[COALESCE(map."targetId"::text, 'legacy-orphan:' || n.user_id)]
    ELSE NULL
  END,
  'sent'::notifications_status_enum,
  migration_support.to_timestamp(n.date::text),
  NULLIF(btrim(n.image::text), ''),
  NULLIF(btrim(n.link::text), ''),
  COALESCE(migration_support.to_timestamp(n.date::text), now()),
  now()
FROM legacy_mysql.tbl_notification n
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = n.user_id;

INSERT INTO "support_tickets" (
  id, "userId", "userName", "userRole", subject, message, "photoUrl", "photoUrls",
  status, response, "createdAt", "updatedAt"
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'srv:legacy:tbl_enquiry:' || e.enq_id),
  map."targetId"::text,
  COALESCE(u.user_name::text, 'Legacy User'),
  CASE u.user_type::text WHEN '2' THEN 'dealer' ELSE 'electrician' END::support_tickets_userrole_enum,
  COALESCE(NULLIF(btrim(e.enq_subject::text), ''), 'Legacy enquiry'),
  COALESCE(NULLIF(btrim(e.enq_comment::text), ''), 'No comment supplied'),
  NULLIF(btrim(e.enq_image::text), ''),
  CASE WHEN NULLIF(btrim(e.enq_image::text), '') IS NULL THEN NULL ELSE ARRAY[e.enq_image::text] END,
  CASE e.enq_type::text WHEN '2' THEN 'resolved' WHEN '1' THEN 'in_progress' ELSE 'open' END::support_tickets_status_enum,
  NULLIF(btrim(e.enq_response::text), ''),
  now(),
  now()
FROM legacy_mysql.tbl_enquiry e
LEFT JOIN legacy_mysql.tbl_users u ON u.user_id = e.user_id
LEFT JOIN "legacy_entity_map" map
  ON map."sourceTable" = 'tbl_users' AND map."sourceId" = e.user_id;

INSERT INTO "settings" (id, key, value, description, "updatedAt")
SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:appName'), 'appName', s.app_name::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:supportEmail'), 'supportEmail', s.app_email::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:supportPhone'), 'supportPhone', s.app_contact::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:websiteUrl'), 'websiteUrl', s.app_website::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:privacyPolicy'), 'privacyPolicy', s.app_privacy_policy::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:termsAndConditions'), 'termsAndConditions', s.app_terms_condition::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:minTransferPoints'), 'minTransferPoints', s.min_transfer_point::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:referralPoints'), 'referralPoints', s.refer_point::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:currentAppVersion'), 'currentAppVersion', s.app_version::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:minAppVersion'), 'minAppVersion', '2.0.0', 'New application minimum version; force update remains disabled during staging', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:forceUpdate'), 'forceUpdate', 'false', 'Disabled until both store releases are approved', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:maintenanceMode'), 'maintenanceMode', CASE WHEN s.app_maintenance_status::text = '1' THEN 'true' ELSE 'false' END, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:maintenanceMessage'), 'maintenanceMessage', s.app_maintenance_description::text, 'Migrated from legacy settings', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:playStoreUrl'), 'playStoreUrl', 'https://play.google.com/store/apps/details?id=com.srvelectricals.app', 'Canonical store URL', now() FROM legacy_mysql.tbl_settings s
UNION ALL SELECT uuid_generate_v5(uuid_ns_url(), 'srv:legacy:setting:appStoreUrl'), 'appStoreUrl', 'https://apps.apple.com/in/app/srv-electricals/id6752710193', 'Canonical store URL', now() FROM legacy_mysql.tbl_settings s;

UPDATE "migration_runs" m
SET "sourceCounts" = jsonb_build_object(
  'users', (SELECT count(*) FROM legacy_mysql.tbl_users),
  'products', (SELECT count(*) FROM legacy_mysql.tbl_product),
  'productVariants', (SELECT count(*) FROM legacy_mysql.tbl_product_variant),
  'qrCodes', (SELECT count(*) FROM legacy_mysql.tbl_redeem_codes_details),
  'walletTransactions', (SELECT count(*) FROM legacy_mysql.tbl_wallet_history),
  'withdrawals', (SELECT count(*) FROM legacy_mysql.tbl_withdrawal)
)
WHERE m.id = (SELECT id FROM current_migration_run);

COMMIT;
