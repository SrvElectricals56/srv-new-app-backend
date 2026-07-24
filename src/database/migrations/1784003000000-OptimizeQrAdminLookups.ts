import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeQrAdminLookups1784003000000 implements MigrationInterface {
  name = 'OptimizeQrAdminLookups1784003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scans_qrCodeId_scannedAt"
      ON "scans" ("qrCodeId", "scannedAt" ASC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_scan_reference"
      ON "wallet_transactions" ("referenceType", "referenceId", "source")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_wallet_transactions_scan_reference"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_scans_qrCodeId_scannedAt"');
  }
}
