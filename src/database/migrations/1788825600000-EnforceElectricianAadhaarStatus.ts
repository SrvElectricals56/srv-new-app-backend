import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceElectricianAadhaarStatus1788825600000 implements MigrationInterface {
  name = 'EnforceElectricianAadhaarStatus1788825600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const [{ enumType }] = await queryRunner.query(`
      SELECT format('%I.%I', namespace.nspname, type.typname) AS "enumType"
      FROM pg_attribute column_info
      JOIN pg_class table_info ON table_info.oid = column_info.attrelid
      JOIN pg_type type ON type.oid = column_info.atttypid
      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE table_info.oid = 'electricians'::regclass
        AND column_info.attname = 'kycStatus'
    `);
    // Retain the original values so this repair can be reversed exactly.
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS admin_kyc_repair_20260908 (
      id text PRIMARY KEY, previous_status text NOT NULL, repaired_status text NOT NULL
    )`);
    await queryRunner.query(`INSERT INTO admin_kyc_repair_20260908
      SELECT id::text, "kycStatus"::text,
        CASE WHEN "kycStatus" = 'rejected' AND NULLIF(btrim("kycRejectionReason"), '') IS NOT NULL
             AND btrim("kycRejectionReason") <> 'Imported legacy KYC status' THEN 'rejected'
             WHEN NULLIF(btrim("aadharFrontImage"), '') IS NOT NULL THEN 'verified' ELSE 'pending' END
      FROM electricians ON CONFLICT (id) DO NOTHING`);
    await queryRunner.query(`UPDATE electricians e SET "kycStatus" = a.repaired_status::${enumType}
      FROM admin_kyc_repair_20260908 a WHERE e.id::text = a.id AND e."kycStatus"::text <> a.repaired_status`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [{ enumType }] = await queryRunner.query(`
      SELECT format('%I.%I', namespace.nspname, type.typname) AS "enumType"
      FROM pg_attribute column_info
      JOIN pg_class table_info ON table_info.oid = column_info.attrelid
      JOIN pg_type type ON type.oid = column_info.atttypid
      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE table_info.oid = 'electricians'::regclass
        AND column_info.attname = 'kycStatus'
    `);
    await queryRunner.query(`UPDATE electricians e SET "kycStatus" = a.previous_status::${enumType}
      FROM admin_kyc_repair_20260908 a WHERE e.id::text = a.id AND e."kycStatus"::text = a.repaired_status`);
    await queryRunner.query('DROP TABLE admin_kyc_repair_20260908');
  }
}
