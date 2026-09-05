import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileLegacyAppAndWorkflowState1787390000000 implements MigrationInterface {
  name = 'ReconcileLegacyAppAndWorkflowState1787390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Undo the earlier date-only repair for non-legacy requests that were never
    // processed by an admin. Source-backed legacy rows are reconciled below.
    await queryRunner.query(`
      UPDATE "redemptions" redemption
      SET "status" = 'pending', "processedAt" = NULL
      WHERE redemption."status" = 'approved'
        AND redemption."processedBy" IS NULL
        AND redemption."requestedAt" < TIMESTAMPTZ '2026-08-21 00:00:00+05:30'
        AND redemption."processedAt" IS NOT DISTINCT FROM redemption."updatedAt"
        AND NOT EXISTS (
          SELECT 1 FROM "legacy_entity_map" map
          WHERE map."targetTable" = 'redemptions' AND map."targetId" = redemption.id
        )
    `);

    await queryRunner.query(`
      DO $reconcile$
      BEGIN
        IF EXISTS (SELECT 1 FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_users')
           AND to_regclass('legacy_mysql.tbl_users') IS NULL THEN
          RAISE EXCEPTION 'Legacy user reconciliation requires legacy_mysql.tbl_users';
        END IF;
        IF EXISTS (SELECT 1 FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_withdrawal')
           AND to_regclass('legacy_mysql.tbl_withdrawal') IS NULL THEN
          RAISE EXCEPTION 'Legacy redemption reconciliation requires legacy_mysql.tbl_withdrawal';
        END IF;
        IF EXISTS (SELECT 1 FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_user_redeem')
           AND to_regclass('legacy_mysql.tbl_user_redeem') IS NULL THEN
          RAISE EXCEPTION 'Legacy gift reconciliation requires legacy_mysql.tbl_user_redeem';
        END IF;
        IF EXISTS (SELECT 1 FROM "legacy_entity_map" WHERE "sourceTable" = 'tbl_wallet_history')
           AND to_regclass('legacy_mysql.tbl_wallet_history') IS NULL THEN
          RAISE EXCEPTION 'Legacy wallet reconciliation requires legacy_mysql.tbl_wallet_history';
        END IF;

        IF to_regclass('legacy_mysql.tbl_users') IS NOT NULL
           AND to_regclass('public.legacy_entity_map') IS NOT NULL THEN
          UPDATE "electricians" target
          SET "kycStatus" = CASE source.kyc_status::text
                WHEN '2' THEN 'verified'::electricians_kycstatus_enum
                WHEN '1' THEN 'pending'::electricians_kycstatus_enum
                WHEN '0' THEN 'rejected'::electricians_kycstatus_enum
                ELSE 'not_submitted'::electricians_kycstatus_enum END,
              "bankLinked" = source.bank_status::text = '2'
          FROM "legacy_entity_map" map
          JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
          WHERE map."sourceTable" = 'tbl_users' AND map."targetTable" = 'electricians'
            AND map."sourceId" = COALESCE(NULLIF(map.metadata->>'canonicalSourceId', '')::bigint, map."sourceId")
            AND target.id = map."targetId";

          UPDATE "dealers" target
          SET "kycStatus" = CASE source.kyc_status::text
                WHEN '2' THEN 'verified'::dealers_kycstatus_enum
                WHEN '1' THEN 'pending'::dealers_kycstatus_enum
                WHEN '0' THEN 'rejected'::dealers_kycstatus_enum
                ELSE 'not_submitted'::dealers_kycstatus_enum END,
              "bankLinked" = source.bank_status::text = '2'
          FROM "legacy_entity_map" map
          JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
          WHERE map."sourceTable" = 'tbl_users' AND map."targetTable" = 'dealers'
            AND map."sourceId" = COALESCE(NULLIF(map.metadata->>'canonicalSourceId', '')::bigint, map."sourceId")
            AND target.id = map."targetId";

          UPDATE "app_users" target
          SET "kycStatus" = CASE source.kyc_status::text
                WHEN '2' THEN 'verified'::app_users_kycstatus_enum
                WHEN '1' THEN 'pending'::app_users_kycstatus_enum
                WHEN '0' THEN 'rejected'::app_users_kycstatus_enum
                ELSE 'not_submitted'::app_users_kycstatus_enum END,
              "bankLinked" = source.bank_status::text = '2'
          FROM "legacy_entity_map" map
          JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
          WHERE map."sourceTable" = 'tbl_users' AND map."targetTable" = 'app_users'
            AND map."sourceId" = COALESCE(NULLIF(map.metadata->>'canonicalSourceId', '')::bigint, map."sourceId")
            AND target.id = map."targetId";

          WITH install_evidence AS (
            SELECT map."targetTable", map."targetId", MIN(source.created_at) AS installed_at
            FROM "legacy_entity_map" map
            JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
            WHERE map."sourceTable" = 'tbl_users'
              AND map."targetTable" IN ('electricians', 'dealers', 'app_users')
              AND (
                NULLIF(btrim(COALESCE(source.device_id::text, '')), '') IS NOT NULL
                OR NULLIF(btrim(COALESCE(source.token::text, '')), '') IS NOT NULL
              )
            GROUP BY map."targetTable", map."targetId"
          )
          UPDATE "electricians" target
          SET "firstAppLoginAt" = LEAST(
                COALESCE(target."firstAppLoginAt", evidence.installed_at), evidence.installed_at
              )
          FROM install_evidence evidence
          WHERE evidence."targetTable" = 'electricians' AND target.id = evidence."targetId"
            AND evidence.installed_at IS NOT NULL;

          WITH install_evidence AS (
            SELECT map."targetId", MIN(source.created_at) AS installed_at
            FROM "legacy_entity_map" map
            JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
            WHERE map."sourceTable" = 'tbl_users' AND map."targetTable" = 'dealers'
              AND (
                NULLIF(btrim(COALESCE(source.device_id::text, '')), '') IS NOT NULL
                OR NULLIF(btrim(COALESCE(source.token::text, '')), '') IS NOT NULL
              )
            GROUP BY map."targetId"
          )
          UPDATE "dealers" target
          SET "firstAppLoginAt" = LEAST(
                COALESCE(target."firstAppLoginAt", evidence.installed_at), evidence.installed_at
              )
          FROM install_evidence evidence
          WHERE target.id = evidence."targetId" AND evidence.installed_at IS NOT NULL;

          WITH install_evidence AS (
            SELECT map."targetId", MIN(source.created_at) AS installed_at
            FROM "legacy_entity_map" map
            JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
            WHERE map."sourceTable" = 'tbl_users' AND map."targetTable" = 'app_users'
              AND (
                NULLIF(btrim(COALESCE(source.device_id::text, '')), '') IS NOT NULL
                OR NULLIF(btrim(COALESCE(source.token::text, '')), '') IS NOT NULL
              )
            GROUP BY map."targetId"
          )
          UPDATE "app_users" target
          SET "firstAppLoginAt" = LEAST(
                COALESCE(target."firstAppLoginAt", evidence.installed_at), evidence.installed_at
              )
          FROM install_evidence evidence
          WHERE target.id = evidence."targetId" AND evidence.installed_at IS NOT NULL;
        END IF;

        IF to_regclass('legacy_mysql.tbl_withdrawal') IS NOT NULL THEN
          UPDATE "redemptions" target
          SET "status" = CASE source.w_type::text
                WHEN '2' THEN 'approved'::redemptions_status_enum
                WHEN '3' THEN 'rejected'::redemptions_status_enum
                ELSE 'pending'::redemptions_status_enum END,
              "processedAt" = CASE WHEN source.w_type::text IN ('2', '3')
                THEN COALESCE(target."processedAt", target."updatedAt") ELSE NULL END,
              "rejectionReason" = CASE WHEN source.w_type::text = '3'
                THEN NULLIF(btrim(source.w_desc::text), '') ELSE NULL END
          FROM "legacy_entity_map" map
          JOIN legacy_mysql.tbl_withdrawal source ON source.w_id = map."sourceId"
          WHERE map."sourceTable" = 'tbl_withdrawal' AND map."targetTable" = 'redemptions'
            AND target.id = map."targetId";
        END IF;

        IF to_regclass('legacy_mysql.tbl_user_redeem') IS NOT NULL THEN
          UPDATE "gift_orders" target
          SET status = CASE source.user_redeem_type::text
                WHEN '2' THEN 'shipped'::gift_orders_status_enum
                WHEN '3' THEN 'delivered'::gift_orders_status_enum
                WHEN '4' THEN 'rejected'::gift_orders_status_enum
                ELSE 'pending'::gift_orders_status_enum END,
              "processedAt" = CASE WHEN source.user_redeem_type::text <> '1'
                THEN COALESCE(target."processedAt", target."updatedAt") ELSE NULL END
          FROM "legacy_entity_map" map
          JOIN legacy_mysql.tbl_user_redeem source ON source.user_redeem_id = map."sourceId"
          WHERE map."sourceTable" = 'tbl_user_redeem' AND map."targetTable" = 'gift_orders'
            AND target.id = map."targetId";
        END IF;

        IF to_regclass('legacy_mysql.tbl_wallet_history') IS NOT NULL THEN
          DELETE FROM "wallet_transactions" target
          USING "legacy_entity_map" map, legacy_mysql.tbl_wallet_history source
          WHERE map."sourceTable" = 'tbl_wallet_history'
            AND map."targetTable" = 'wallet_transactions'
            AND source.wallet_id = map."sourceId"
            AND COALESCE(source.wallet_status::text, '1') <> '1'
            AND target.id = map."targetId";

          DELETE FROM "legacy_entity_map" map
          USING legacy_mysql.tbl_wallet_history source
          WHERE map."sourceTable" = 'tbl_wallet_history'
            AND map."targetTable" = 'wallet_transactions'
            AND source.wallet_id = map."sourceId"
            AND COALESCE(source.wallet_status::text, '1') <> '1';
        END IF;
      END
      $reconcile$;
    `);

    for (const table of ['electricians', 'dealers', 'app_users', 'counterboys']) {
      await queryRunner.query(`
        UPDATE "${table}"
        SET "appInstalled" = ("firstAppLoginAt" IS NOT NULL)
        WHERE "appInstalled" IS DISTINCT FROM ("firstAppLoginAt" IS NOT NULL)
      `);
    }
  }

  public async down(): Promise<void> {
    // Source-backed reconciliation is intentionally not guessed in reverse.
  }
}
