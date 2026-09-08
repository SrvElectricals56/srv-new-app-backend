import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceElectricianAadhaarStatus1788825600000 implements MigrationInterface {
  name = 'EnforceElectricianAadhaarStatus1788825600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Retain the original values so this repair can be reversed exactly.
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS admin_kyc_repair_20260908 (
      id uuid PRIMARY KEY, previous_status text NOT NULL, repaired_status text NOT NULL
    )`);
    await queryRunner.query(`INSERT INTO admin_kyc_repair_20260908
      SELECT id, "kycStatus"::text,
        CASE WHEN "kycStatus" = 'rejected' AND NULLIF(btrim("kycRejectionReason"), '') IS NOT NULL
             AND btrim("kycRejectionReason") <> 'Imported legacy KYC status' THEN 'rejected'
             WHEN NULLIF(btrim("aadharFrontImage"), '') IS NOT NULL THEN 'verified' ELSE 'pending' END
      FROM electricians ON CONFLICT (id) DO NOTHING`);
    await queryRunner.query(`UPDATE electricians e SET "kycStatus" = a.repaired_status::electricians_kycstatus_enum
      FROM admin_kyc_repair_20260908 a WHERE e.id = a.id AND e."kycStatus"::text <> a.repaired_status`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE electricians e SET "kycStatus" = a.previous_status::electricians_kycstatus_enum
      FROM admin_kyc_repair_20260908 a WHERE e.id = a.id AND e."kycStatus"::text = a.repaired_status`);
    await queryRunner.query('DROP TABLE admin_kyc_repair_20260908');
  }
}
