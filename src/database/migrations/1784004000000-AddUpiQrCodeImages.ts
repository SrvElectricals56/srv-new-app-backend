import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUpiQrCodeImages1784004000000 implements MigrationInterface {
  name = 'AddUpiQrCodeImages1784004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['dealers', 'electricians', 'app_users', 'counterboys']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "upiQrCodeImage" text`);
    }
    await queryRunner.query(`ALTER TABLE "redemptions" ADD COLUMN IF NOT EXISTS "upiQrCodeImage" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "redemptions" DROP COLUMN IF EXISTS "upiQrCodeImage"`);
    for (const table of ['dealers', 'electricians', 'app_users', 'counterboys']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "upiQrCodeImage"`);
    }
  }
}
