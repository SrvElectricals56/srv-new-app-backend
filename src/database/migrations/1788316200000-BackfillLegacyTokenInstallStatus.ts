import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A non-empty legacy device/token value is direct evidence that the account
 * registered an app installation. Some legacy rows have an invalid or empty
 * created_at value, so the join date is the safest historical fallback.
 */
export class BackfillLegacyTokenInstallStatus1788316200000 implements MigrationInterface {
  name = 'BackfillLegacyTokenInstallStatus1788316200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $backfill$
      BEGIN
        IF to_regclass('legacy_mysql.tbl_users') IS NOT NULL
           AND to_regclass('public.legacy_entity_map') IS NOT NULL THEN
          WITH token_evidence AS (
            SELECT map."targetId", MIN(source.created_at) AS installed_at
            FROM "legacy_entity_map" map
            JOIN legacy_mysql.tbl_users source ON source.user_id = map."sourceId"
            WHERE map."sourceTable" = 'tbl_users'
              AND map."targetTable" = 'electricians'
              AND (
                NULLIF(btrim(COALESCE(source.device_id::text, '')), '') IS NOT NULL
                OR NULLIF(btrim(COALESCE(source.token::text, '')), '') IS NOT NULL
              )
            GROUP BY map."targetId"
          )
          UPDATE "electricians" target
          SET "firstAppLoginAt" = COALESCE(
                target."firstAppLoginAt",
                evidence.installed_at,
                target."joinedDate",
                now()
              ),
              "appInstalled" = true
          FROM token_evidence evidence
          WHERE target.id = evidence."targetId";
        END IF;

        IF to_regclass('public.mobile_push_tokens') IS NOT NULL THEN
          UPDATE "electricians" target
          SET "firstAppLoginAt" = COALESCE(
                target."firstAppLoginAt",
                evidence.installed_at,
                target."joinedDate",
                now()
              ),
              "appInstalled" = true
          FROM (
            SELECT "userId", MIN("updatedAt") AS installed_at
            FROM "mobile_push_tokens"
            WHERE "userRole" = 'electrician'
              AND NULLIF(btrim(COALESCE(token, '')), '') IS NOT NULL
            GROUP BY "userId"
          ) evidence
          WHERE target.id::text = evidence."userId"::text;
        END IF;

        UPDATE "electricians"
        SET "appInstalled" = ("firstAppLoginAt" IS NOT NULL)
        WHERE "appInstalled" IS DISTINCT FROM ("firstAppLoginAt" IS NOT NULL);
      END
      $backfill$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_installed_date" ON "electricians" ("firstAppLoginAt" DESC) WHERE "firstAppLoginAt" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_not_installed_joined" ON "electricians" ("joinedDate" DESC) WHERE "firstAppLoginAt" IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dealers_installed_date" ON "dealers" ("firstAppLoginAt" DESC) WHERE "firstAppLoginAt" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dealers_not_installed_joined" ON "dealers" ("joinedDate" DESC) WHERE "firstAppLoginAt" IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_role_created" ON "wallet_transactions" ("userRole", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_user_created" ON "wallet_transactions" ("userId", "userRole", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_kyc_joined" ON "electricians" ("kycStatus", "joinedDate" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dealers_kyc_joined" ON "dealers" ("kycStatus", "joinedDate" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_dealers_kyc_joined"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_electricians_kyc_joined"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_wallet_transactions_user_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_wallet_transactions_role_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_dealers_not_installed_joined"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_dealers_installed_date"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_electricians_not_installed_joined"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_electricians_installed_date"');
    // Installation evidence must not be discarded during rollback.
  }
}
