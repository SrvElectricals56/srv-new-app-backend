import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRuntimeAndMigrationArtifacts1782600000000
  implements MigrationInterface
{
  name = 'AddRuntimeAndMigrationArtifacts1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sub_dealers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL DEFAULT 'SRV Dealer',
        "district" varchar,
        "pincode" varchar,
        "electricianCount" integer NOT NULL DEFAULT 0,
        "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
        "lastSeenAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_ratings" (
        "userId" varchar(255) PRIMARY KEY,
        "userRole" varchar(50) NOT NULL,
        "rating" integer NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
        "review" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mobile_push_tokens" (
        "token" text PRIMARY KEY,
        "userId" text NOT NULL,
        "userRole" varchar(50) NOT NULL,
        "platform" varchar(20),
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "migration_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceFile" text NOT NULL,
        "sourceSha256" char(64) NOT NULL,
        "sourceCreatedAt" timestamptz,
        "startedAt" timestamptz NOT NULL DEFAULT now(),
        "completedAt" timestamptz,
        "status" varchar(30) NOT NULL DEFAULT 'running',
        "sourceCounts" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "targetCounts" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reconciliation" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "notes" text
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legacy_entity_map" (
        "sourceTable" varchar(100) NOT NULL,
        "sourceId" bigint NOT NULL,
        "targetTable" varchar(100) NOT NULL,
        "targetId" uuid,
        "targetKey" text,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_legacy_entity_map"
          PRIMARY KEY ("sourceTable", "sourceId", "targetTable")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legacy_import_exceptions" (
        "id" bigserial PRIMARY KEY,
        "migrationRunId" uuid REFERENCES "migration_runs"("id") ON DELETE CASCADE,
        "sourceTable" varchar(100) NOT NULL,
        "sourceId" bigint,
        "exceptionType" varchar(100) NOT NULL,
        "severity" varchar(20) NOT NULL DEFAULT 'warning',
        "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_batchId"
      ON "qr_codes" ("batchId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_orders_razorpay_order"
      ON "product_orders" ("razorpayOrderId")
      WHERE "razorpayOrderId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_orders_razorpay_payment"
      ON "product_orders" ("razorpayPaymentId")
      WHERE "razorpayPaymentId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_batchNo"
      ON "qr_codes" ("batchNo")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_productId"
      ON "qr_codes" ("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_isScanned_isActive"
      ON "qr_codes" ("isScanned", "isActive")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_createdAt"
      ON "qr_codes" ("createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_legacyRedeemerId"
      ON "qr_codes" ("legacyRedeemerId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mobile_push_tokens_user"
      ON "mobile_push_tokens" ("userRole", "userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_legacy_entity_map_target"
      ON "legacy_entity_map" ("targetTable", "targetId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_legacy_import_exceptions_lookup"
      ON "legacy_import_exceptions" ("sourceTable", "sourceId", "exceptionType")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "legacy_import_exceptions"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "legacy_entity_map"');
    await queryRunner.query('DROP TABLE IF EXISTS "migration_runs"');
    await queryRunner.query('DROP TABLE IF EXISTS "mobile_push_tokens"');
    await queryRunner.query('DROP TABLE IF EXISTS "app_ratings"');
    await queryRunner.query('DROP TABLE IF EXISTS "sub_dealers"');
  }
}
