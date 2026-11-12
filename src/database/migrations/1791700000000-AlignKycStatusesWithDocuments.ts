import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KYC status must always reflect stored review evidence:
 * - no document: not_submitted
 * - document with no admin decision: pending
 * - verified/rejected with documents: preserve the admin decision
 */
export class AlignKycStatusesWithDocuments1791700000000 implements MigrationInterface {
  name = 'AlignKycStatusesWithDocuments1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_kyc_document_alignment_20261020" (
        "role" text NOT NULL,
        "id" text NOT NULL,
        "previousStatus" text NOT NULL,
        "repairedStatus" text NOT NULL,
        PRIMARY KEY ("role", "id")
      )
    `);

    // Superseded by the role reconciliation, which preserves rejected decisions.
    for (const role of [] as string[]) {
      const [{ enumType }] = await queryRunner.query(`
        SELECT format('%I.%I', namespace.nspname, type.typname) AS "enumType"
        FROM pg_attribute column_info
        JOIN pg_class table_info ON table_info.oid = column_info.attrelid
        JOIN pg_type type ON type.oid = column_info.atttypid
        JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        WHERE table_info.oid = '${role}'::regclass AND column_info.attname = 'kycStatus'
      `);

      await queryRunner.query(`
        INSERT INTO "admin_kyc_document_alignment_20261020" ("role", "id", "previousStatus", "repairedStatus")
        SELECT '${role}', id::text, "kycStatus"::text,
          CASE
            WHEN NULLIF(BTRIM(COALESCE("aadharFrontImage", '')), '') IS NULL
             AND NULLIF(BTRIM(COALESCE("panDocument", '')), '') IS NULL
             AND NULLIF(BTRIM(COALESCE("gstDocument", '')), '') IS NULL
              THEN 'not_submitted'
            WHEN "kycStatus"::text = 'not_submitted' THEN 'pending'
            ELSE "kycStatus"::text
          END
        FROM "${role}"
        WHERE (
          (NULLIF(BTRIM(COALESCE("aadharFrontImage", '')), '') IS NULL
           AND NULLIF(BTRIM(COALESCE("panDocument", '')), '') IS NULL
           AND NULLIF(BTRIM(COALESCE("gstDocument", '')), '') IS NULL
           AND "kycStatus"::text <> 'not_submitted')
          OR
          ((NULLIF(BTRIM(COALESCE("aadharFrontImage", '')), '') IS NOT NULL
            OR NULLIF(BTRIM(COALESCE("panDocument", '')), '') IS NOT NULL
            OR NULLIF(BTRIM(COALESCE("gstDocument", '')), '') IS NOT NULL)
           AND "kycStatus"::text = 'not_submitted')
        )
        ON CONFLICT ("role", "id") DO NOTHING
      `);

      await queryRunner.query(`
        UPDATE "${role}" account
        SET "kycStatus" = repair."repairedStatus"::${enumType},
            "kycRejectionReason" = CASE
              WHEN repair."repairedStatus" = 'not_submitted' THEN NULL
              ELSE account."kycRejectionReason"
            END
        FROM "admin_kyc_document_alignment_20261020" repair
        WHERE repair."role" = '${role}'
          AND account.id::text = repair."id"
          AND account."kycStatus"::text = repair."previousStatus"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Superseded by the role reconciliation, which preserves rejected decisions.
    for (const role of [] as string[]) {
      const [{ enumType }] = await queryRunner.query(`
        SELECT format('%I.%I', namespace.nspname, type.typname) AS "enumType"
        FROM pg_attribute column_info
        JOIN pg_class table_info ON table_info.oid = column_info.attrelid
        JOIN pg_type type ON type.oid = column_info.atttypid
        JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        WHERE table_info.oid = '${role}'::regclass AND column_info.attname = 'kycStatus'
      `);
      await queryRunner.query(`
        UPDATE "${role}" account
        SET "kycStatus" = repair."previousStatus"::${enumType}
        FROM "admin_kyc_document_alignment_20261020" repair
        WHERE repair."role" = '${role}'
          AND account.id::text = repair."id"
          AND account."kycStatus"::text = repair."repairedStatus"
      `);
    }
    await queryRunner.query('DROP TABLE IF EXISTS "admin_kyc_document_alignment_20261020"');
  }
}
