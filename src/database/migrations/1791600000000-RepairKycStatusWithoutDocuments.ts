import { MigrationInterface, QueryRunner } from 'typeorm';

/** Correct legacy rows whose missing documents were incorrectly marked pending. */
export class RepairKycStatusWithoutDocuments1791600000000 implements MigrationInterface {
  name = 'RepairKycStatusWithoutDocuments1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_kyc_status_repair_20261020" (
        "role" text NOT NULL,
        "id" text NOT NULL,
        "previousStatus" text NOT NULL,
        "repairedStatus" text NOT NULL,
        PRIMARY KEY ("role", "id")
      )
    `);

    for (const role of ['electricians', 'dealers']) {
      const [{ enumType }] = await queryRunner.query(`
        SELECT format('%I.%I', namespace.nspname, type.typname) AS "enumType"
        FROM pg_attribute column_info
        JOIN pg_class table_info ON table_info.oid = column_info.attrelid
        JOIN pg_type type ON type.oid = column_info.atttypid
        JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
        WHERE table_info.oid = '${role}'::regclass AND column_info.attname = 'kycStatus'
      `);
      await queryRunner.query(`
        INSERT INTO "admin_kyc_status_repair_20261020" ("role", "id", "previousStatus", "repairedStatus")
        SELECT '${role}', id::text, "kycStatus"::text, 'not_submitted'
        FROM "${role}"
        WHERE "kycStatus"::text = 'pending'
          AND NULLIF(BTRIM(COALESCE("aadharFrontImage", '')), '') IS NULL
          AND NULLIF(BTRIM(COALESCE("panDocument", '')), '') IS NULL
          AND NULLIF(BTRIM(COALESCE("gstDocument", '')), '') IS NULL
        ON CONFLICT ("role", "id") DO NOTHING
      `);
      await queryRunner.query(`
        UPDATE "${role}" account
        SET "kycStatus" = repair."repairedStatus"::${enumType}
        FROM "admin_kyc_status_repair_20261020" repair
        WHERE repair."role" = '${role}'
          AND account.id::text = repair."id"
          AND account."kycStatus"::text = repair."previousStatus"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const role of ['electricians', 'dealers']) {
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
        FROM "admin_kyc_status_repair_20261020" repair
        WHERE repair."role" = '${role}'
          AND account.id::text = repair."id"
          AND account."kycStatus"::text = repair."repairedStatus"
      `);
    }
    await queryRunner.query('DROP TABLE IF EXISTS "admin_kyc_status_repair_20261020"');
  }
}
