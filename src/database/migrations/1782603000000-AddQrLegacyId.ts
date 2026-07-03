import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQrLegacyId1782603000000 implements MigrationInterface {
  name = 'AddQrLegacyId1782603000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "qr_codes" ADD COLUMN "legacyId" bigint
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_qr_codes_legacyId"
      ON "qr_codes" ("legacyId") WHERE "legacyId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_qr_codes_legacyId"');
    await queryRunner.query(
      'ALTER TABLE "qr_codes" DROP COLUMN "legacyId"',
    );
  }
}
