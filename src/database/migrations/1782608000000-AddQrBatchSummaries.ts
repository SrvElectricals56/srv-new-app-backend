import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQrBatchSummaries1782608000000 implements MigrationInterface {
  name = 'AddQrBatchSummaries1782608000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qr_code_batches" (
        "batchId" varchar PRIMARY KEY,
        "batchNo" integer,
        "productId" varchar,
        "productName" varchar NOT NULL DEFAULT '',
        "generatedDate" timestamptz NOT NULL DEFAULT now(),
        "points" numeric(12,2) NOT NULL DEFAULT 0,
        "qty" integer NOT NULL DEFAULT 0,
        "usedQty" integer NOT NULL DEFAULT 0,
        "activeQty" integer NOT NULL DEFAULT 0,
        "createdBy" varchar,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_code_batches_batchNo"
      ON "qr_code_batches" ("batchNo" DESC NULLS LAST)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_code_batches_productName"
      ON "qr_code_batches" ("productName")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_batch_sequence"
      ON "qr_codes" ("batchId", "sequenceNo" ASC NULLS LAST, "createdAt" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_batch_status_sequence"
      ON "qr_codes" ("batchId", "isScanned", "sequenceNo" ASC NULLS LAST)
    `);

    await queryRunner.query(`
      INSERT INTO "qr_code_batches" (
        "batchId",
        "batchNo",
        "productId",
        "productName",
        "generatedDate",
        "points",
        "qty",
        "usedQty",
        "activeQty",
        "createdBy",
        "updatedAt"
      )
      SELECT
        COALESCE(q."batchId", q."batchNo"::text, q."id"::text) AS "batchId",
        MAX(q."batchNo") AS "batchNo",
        MAX(q."productId"::text) AS "productId",
        COALESCE(MAX(q."productName"), '') AS "productName",
        MIN(q."createdAt") AS "generatedDate",
        COALESCE(MAX(q."rewardPoints"), 0) AS "points",
        COUNT(*)::int AS "qty",
        COUNT(*) FILTER (WHERE q."isScanned" = true)::int AS "usedQty",
        COUNT(*) FILTER (WHERE q."isScanned" = false AND q."isActive" = true)::int AS "activeQty",
        MAX(q."createdBy"::text) AS "createdBy",
        now() AS "updatedAt"
      FROM "qr_codes" q
      GROUP BY COALESCE(q."batchId", q."batchNo"::text, q."id"::text)
      ON CONFLICT ("batchId") DO UPDATE SET
        "batchNo" = EXCLUDED."batchNo",
        "productId" = EXCLUDED."productId",
        "productName" = EXCLUDED."productName",
        "generatedDate" = EXCLUDED."generatedDate",
        "points" = EXCLUDED."points",
        "qty" = EXCLUDED."qty",
        "usedQty" = EXCLUDED."usedQty",
        "activeQty" = EXCLUDED."activeQty",
        "createdBy" = EXCLUDED."createdBy",
        "updatedAt" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_codes_batch_status_sequence"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_codes_batch_sequence"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_code_batches_productName"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_code_batches_batchNo"');
    await queryRunner.query('DROP TABLE IF EXISTS "qr_code_batches"');
  }
}
