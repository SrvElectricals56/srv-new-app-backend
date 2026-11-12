import { MigrationInterface, QueryRunner } from 'typeorm';

/** Reconcile existing electrician and dealer KYC without overriding rejections. */
export class ReconcileRoleKycDocumentStatus1793600000000 implements MigrationInterface {
  name = 'ReconcileRoleKycDocumentStatus1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_kyc_document_reconciliation_20261112" (
        "role" text NOT NULL, "id" text NOT NULL, "previousStatus" text NOT NULL,
        "previousReason" text, "newStatus" text NOT NULL, PRIMARY KEY ("role", "id")
      )
    `);
    for (const role of ['electricians', 'dealers']) {
      const [{ enumType }] = await queryRunner.query(`
        SELECT format('%I.%I', n.nspname, t.typname) AS "enumType"
        FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE a.attrelid = '${role}'::regclass AND a.attname = 'kycStatus'
      `);
      await queryRunner.query(`
        INSERT INTO "role_kyc_document_reconciliation_20261112"
          ("role", "id", "previousStatus", "previousReason", "newStatus")
        SELECT '${role}', id::text, "kycStatus"::text, "kycRejectionReason",
          CASE WHEN "kycStatus"::text = 'rejected' THEN 'rejected'
               WHEN NULLIF(BTRIM(COALESCE("aadharFrontImage", '')), '') IS NOT NULL
                 OR NULLIF(BTRIM(COALESCE("panDocument", '')), '') IS NOT NULL
                 OR NULLIF(BTRIM(COALESCE("gstDocument", '')), '') IS NOT NULL
               THEN 'verified' ELSE 'pending' END
        FROM "${role}"
        ON CONFLICT ("role", "id") DO NOTHING
      `);
      await queryRunner.query(`
        UPDATE "${role}" e SET "kycStatus" = a."newStatus"::${enumType},
          "kycRejectionReason" = CASE WHEN a."newStatus" = 'rejected' THEN e."kycRejectionReason" ELSE NULL END
        FROM "role_kyc_document_reconciliation_20261112" a
        WHERE a.role = '${role}' AND e.id::text = a.id
          AND e."kycStatus"::text = a."previousStatus"
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const role of ['electricians', 'dealers']) {
      const [{ enumType }] = await queryRunner.query(`
        SELECT format('%I.%I', n.nspname, t.typname) AS "enumType"
        FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE a.attrelid = '${role}'::regclass AND a.attname = 'kycStatus'
      `);
      await queryRunner.query(`
        UPDATE "${role}" e SET "kycStatus" = a."previousStatus"::${enumType},
          "kycRejectionReason" = a."previousReason"
        FROM "role_kyc_document_reconciliation_20261112" a
        WHERE a.role = '${role}' AND e.id::text = a.id
          AND e."kycStatus"::text = a."newStatus"
      `);
    }
    await queryRunner.query('DROP TABLE "role_kyc_document_reconciliation_20261112"');
  }
}
