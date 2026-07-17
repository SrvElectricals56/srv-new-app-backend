import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLegacyKycAndQrHistory1784001000000 implements MigrationInterface {
  name = 'FixLegacyKycAndQrHistory1784001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qr_download_history" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "adminId" text,
        "adminEmail" text,
        "adminName" text,
        "adminRole" text NOT NULL DEFAULT 'staff',
        "productId" text,
        "productName" text NOT NULL,
        "batchId" text,
        "batchNo" integer,
        "quantity" integer NOT NULL DEFAULT 1,
        "downloadType" text NOT NULL DEFAULT 'qr',
        "downloadedAt" timestamptz NOT NULL DEFAULT now(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "qr_download_history"
        ADD COLUMN IF NOT EXISTS "adminId" text,
        ADD COLUMN IF NOT EXISTS "adminEmail" text,
        ADD COLUMN IF NOT EXISTS "adminName" text,
        ADD COLUMN IF NOT EXISTS "adminRole" text,
        ADD COLUMN IF NOT EXISTS "productId" text,
        ADD COLUMN IF NOT EXISTS "productName" text,
        ADD COLUMN IF NOT EXISTS "batchId" text,
        ADD COLUMN IF NOT EXISTS "batchNo" integer,
        ADD COLUMN IF NOT EXISTS "quantity" integer,
        ADD COLUMN IF NOT EXISTS "downloadType" text,
        ADD COLUMN IF NOT EXISTS "downloadedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "createdAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz
    `);
    await queryRunner.query(`
      UPDATE "qr_download_history" SET
        "adminRole" = COALESCE(NULLIF("adminRole", ''), 'staff'),
        "productName" = COALESCE(NULLIF("productName", ''), 'Unknown Product'),
        "quantity" = GREATEST(COALESCE("quantity", 1), 1),
        "downloadType" = COALESCE(NULLIF("downloadType", ''), 'qr'),
        "downloadedAt" = COALESCE("downloadedAt", now()),
        "createdAt" = COALESCE("createdAt", now()),
        "updatedAt" = COALESCE("updatedAt", now())
    `);
    await queryRunner.query(`
      ALTER TABLE "qr_download_history"
        ALTER COLUMN "adminRole" SET DEFAULT 'staff', ALTER COLUMN "adminRole" SET NOT NULL,
        ALTER COLUMN "productName" SET NOT NULL,
        ALTER COLUMN "quantity" SET DEFAULT 1, ALTER COLUMN "quantity" SET NOT NULL,
        ALTER COLUMN "downloadType" SET DEFAULT 'qr', ALTER COLUMN "downloadType" SET NOT NULL,
        ALTER COLUMN "downloadedAt" SET DEFAULT now(), ALTER COLUMN "downloadedAt" SET NOT NULL,
        ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "createdAt" SET NOT NULL,
        ALTER COLUMN "updatedAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_download_history_downloadedAt"
      ON "qr_download_history" ("downloadedAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_download_history_admin"
      ON "qr_download_history" ("adminEmail", "adminName")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_admin_page"
      ON "qr_codes" ("batchNo" DESC NULLS LAST, "sequenceNo" ASC NULLS LAST, "createdAt" DESC)
    `);

    // Legacy PHP defined status 0 as rejected. Only touch canonical users that
    // were imported from tbl_users, so genuinely new unsubmitted KYCs remain so.
    for (const table of ['electricians', 'dealers', 'app_users']) {
      await queryRunner.query(`
        UPDATE "${table}" target
        SET "kycStatus" = 'rejected',
            "kycRejectionReason" = COALESCE(target."kycRejectionReason", 'Imported legacy KYC status')
        WHERE target."kycStatus" = 'not_submitted'
          AND EXISTS (
            SELECT 1 FROM "legacy_entity_map" map
            WHERE map."sourceTable" = 'tbl_users'
              AND map."targetTable" = $1
              AND map."targetId" = target.id
          )
      `, [table]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_codes_admin_page"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_download_history_admin"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_download_history_downloadedAt"');
  }
}
