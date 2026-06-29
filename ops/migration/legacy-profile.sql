SET SESSION sql_mode = '';

SELECT 'TABLE_COUNTS' AS section;
SELECT 'tbl_admin' AS table_name, COUNT(*) AS row_count FROM tbl_admin
UNION ALL SELECT 'tbl_banner', COUNT(*) FROM tbl_banner
UNION ALL SELECT 'tbl_category', COUNT(*) FROM tbl_category
UNION ALL SELECT 'tbl_city', COUNT(*) FROM tbl_city
UNION ALL SELECT 'tbl_district', COUNT(*) FROM tbl_district
UNION ALL SELECT 'tbl_enquiry', COUNT(*) FROM tbl_enquiry
UNION ALL SELECT 'tbl_event', COUNT(*) FROM tbl_event
UNION ALL SELECT 'tbl_faq', COUNT(*) FROM tbl_faq
UNION ALL SELECT 'tbl_fav', COUNT(*) FROM tbl_fav
UNION ALL SELECT 'tbl_gallery', COUNT(*) FROM tbl_gallery
UNION ALL SELECT 'tbl_gallery_category', COUNT(*) FROM tbl_gallery_category
UNION ALL SELECT 'tbl_notification', COUNT(*) FROM tbl_notification
UNION ALL SELECT 'tbl_offer', COUNT(*) FROM tbl_offer
UNION ALL SELECT 'tbl_plan_range', COUNT(*) FROM tbl_plan_range
UNION ALL SELECT 'tbl_product', COUNT(*) FROM tbl_product
UNION ALL SELECT 'tbl_product_variant', COUNT(*) FROM tbl_product_variant
UNION ALL SELECT 'tbl_redeem_category', COUNT(*) FROM tbl_redeem_category
UNION ALL SELECT 'tbl_redeem_codes', COUNT(*) FROM tbl_redeem_codes
UNION ALL SELECT 'tbl_redeem_codes_details', COUNT(*) FROM tbl_redeem_codes_details
UNION ALL SELECT 'tbl_redeem_product', COUNT(*) FROM tbl_redeem_product
UNION ALL SELECT 'tbl_sells', COUNT(*) FROM tbl_sells
UNION ALL SELECT 'tbl_settings', COUNT(*) FROM tbl_settings
UNION ALL SELECT 'tbl_state', COUNT(*) FROM tbl_state
UNION ALL SELECT 'tbl_testimonial', COUNT(*) FROM tbl_testimonial
UNION ALL SELECT 'tbl_user_redeem', COUNT(*) FROM tbl_user_redeem
UNION ALL SELECT 'tbl_user_type', COUNT(*) FROM tbl_user_type
UNION ALL SELECT 'tbl_users', COUNT(*) FROM tbl_users
UNION ALL SELECT 'tbl_wallet_history', COUNT(*) FROM tbl_wallet_history
UNION ALL SELECT 'tbl_withdrawal', COUNT(*) FROM tbl_withdrawal
ORDER BY table_name;

SELECT 'USERS_BY_ROLE_AND_STATUS' AS section;
SELECT user_type, status, kyc_status, bank_status, COUNT(*) AS users
FROM tbl_users
GROUP BY user_type, status, kyc_status, bank_status
ORDER BY user_type, status, kyc_status, bank_status;

SELECT 'USER_DATA_QUALITY' AS section;
SELECT
  COUNT(*) AS total_users,
  SUM(TRIM(phone) = '') AS blank_phones,
  SUM(TRIM(phone) NOT REGEXP '^[0-9]{10}$') AS nonstandard_phones,
  SUM(TRIM(wallet) NOT REGEXP '^-?[0-9]+(\\.[0-9]+)?$') AS invalid_wallet_values,
  SUM(TRIM(password) <> '') AS users_with_password,
  SUM(TRIM(confirm_code) <> '') AS users_with_stored_otp,
  SUM(TRIM(token) <> '') AS users_with_push_token,
  SUM(TRIM(adharcard_front) <> '' OR TRIM(adharcard_back) <> '' OR TRIM(pan_card) <> '') AS users_with_kyc_files,
  ROUND(SUM(CASE WHEN TRIM(wallet) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(wallet AS DECIMAL(18,2)) ELSE 0 END), 2) AS stored_wallet_total
FROM tbl_users;

SELECT 'DUPLICATE_PHONES' AS section;
SELECT COUNT(*) AS duplicate_phone_groups, COALESCE(SUM(duplicate_count - 1), 0) AS extra_user_rows
FROM (
  SELECT TRIM(phone) AS normalized_phone, COUNT(*) AS duplicate_count
  FROM tbl_users
  WHERE TRIM(phone) <> ''
  GROUP BY TRIM(phone)
  HAVING COUNT(*) > 1
) duplicates;

SELECT 'QR_STATUS' AS section;
SELECT qr_code_status, COUNT(*) AS qr_codes,
       SUM(qr_code_redeem_user_id IS NOT NULL AND qr_code_redeem_user_id <> 0) AS linked_to_user
FROM tbl_redeem_codes_details
GROUP BY qr_code_status
ORDER BY qr_code_status;

SELECT 'QR_DATA_QUALITY' AS section;
SELECT
  COUNT(*) AS total_qr_codes,
  COUNT(*) AS distinct_qr_codes,
  0 AS duplicate_qr_rows,
  (SELECT COUNT(*) FROM tbl_redeem_codes_details WHERE qr_code = '') AS blank_qr_codes
FROM tbl_redeem_codes_details;

SELECT 'QR_RELATIONSHIPS' AS section;
SELECT
  (SELECT COUNT(*) FROM tbl_redeem_codes_details details LEFT JOIN tbl_redeem_codes batch ON batch.qr_id = details.qr_id WHERE batch.qr_id IS NULL) AS orphan_batches,
  (SELECT COUNT(*) FROM tbl_redeem_codes_details details LEFT JOIN tbl_product product ON product.product_id = details.qr_code_p_id WHERE product.product_id IS NULL) AS orphan_products,
  (SELECT COUNT(*) FROM tbl_redeem_codes_details details LEFT JOIN tbl_users users ON users.user_id = details.qr_code_redeem_user_id WHERE details.qr_code_redeem_user_id IS NOT NULL AND details.qr_code_redeem_user_id <> 0 AND users.user_id IS NULL) AS orphan_redeeming_users;

SELECT 'WALLET_STATUS' AS section;
SELECT wallet_payment_type, wallet_type, wallet_status, COUNT(*) AS transactions,
       ROUND(SUM(CASE WHEN TRIM(wallet_amount) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(wallet_amount AS DECIMAL(18,2)) ELSE 0 END), 2) AS amount
FROM tbl_wallet_history
GROUP BY wallet_payment_type, wallet_type, wallet_status
ORDER BY wallet_payment_type, wallet_type, wallet_status;

SELECT 'WALLET_DATA_QUALITY' AS section;
SELECT
  COUNT(*) AS total_transactions,
  SUM(TRIM(wallet_amount) NOT REGEXP '^-?[0-9]+(\\.[0-9]+)?$') AS invalid_amounts,
  SUM(users.user_id IS NULL) AS orphan_users,
  ROUND(SUM(CASE WHEN wallet_payment_type = '2' AND TRIM(wallet_amount) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(wallet_amount AS DECIMAL(18,2)) ELSE 0 END), 2) AS total_credits,
  ROUND(SUM(CASE WHEN wallet_payment_type = '1' AND TRIM(wallet_amount) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(wallet_amount AS DECIMAL(18,2)) ELSE 0 END), 2) AS total_debits
FROM tbl_wallet_history wallet
LEFT JOIN tbl_users users ON users.user_id = wallet.user_id;

SELECT 'WALLET_RECONCILIATION' AS section;
WITH ledger AS (
  SELECT user_id,
    SUM(CASE
      WHEN wallet_payment_type = '2' AND TRIM(wallet_amount) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(wallet_amount AS DECIMAL(18,2))
      WHEN wallet_payment_type = '1' AND TRIM(wallet_amount) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN -CAST(wallet_amount AS DECIMAL(18,2))
      ELSE 0
    END) AS ledger_balance
  FROM tbl_wallet_history
  GROUP BY user_id
), comparison AS (
  SELECT users.user_id,
    CASE WHEN TRIM(users.wallet) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(users.wallet AS DECIMAL(18,2)) ELSE 0 END AS stored_balance,
    COALESCE(ledger.ledger_balance, 0) AS ledger_balance
  FROM tbl_users users
  LEFT JOIN ledger ON ledger.user_id = users.user_id
)
SELECT
  COUNT(*) AS compared_users,
  SUM(ABS(stored_balance - ledger_balance) > 0.009) AS mismatched_users,
  ROUND(SUM(ABS(stored_balance - ledger_balance)), 2) AS total_absolute_difference,
  ROUND(MAX(ABS(stored_balance - ledger_balance)), 2) AS maximum_user_difference,
  ROUND(SUM(stored_balance), 2) AS stored_total,
  ROUND(SUM(ledger_balance), 2) AS ledger_total
FROM comparison;

SELECT 'WITHDRAWAL_STATUS' AS section;
SELECT w_type, w_status, COUNT(*) AS withdrawals,
       ROUND(SUM(CASE WHEN TRIM(w_amount) REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN CAST(w_amount AS DECIMAL(18,2)) ELSE 0 END), 2) AS amount
FROM tbl_withdrawal
GROUP BY w_type, w_status
ORDER BY w_type, w_status;

SELECT 'WITHDRAWAL_DATA_QUALITY' AS section;
SELECT COUNT(*) AS total_withdrawals,
       SUM(TRIM(w_amount) NOT REGEXP '^-?[0-9]+(\\.[0-9]+)?$') AS invalid_amounts,
       SUM(users.user_id IS NULL) AS orphan_users
FROM tbl_withdrawal withdrawals
LEFT JOIN tbl_users users ON users.user_id = withdrawals.user_id;

SELECT 'DECLARED_FOREIGN_KEYS' AS section;
SELECT COUNT(*) AS foreign_key_constraints
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE();
