import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaseInsensitiveQrLookup1784002000000 implements MigrationInterface {
  name = 'AddCaseInsensitiveQrLookup1784002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qr_codes_code_lower"
      ON "qr_codes" (LOWER(code))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_qr_codes_code_lower"');
  }
}
