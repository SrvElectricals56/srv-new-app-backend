import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerPhoneVerification1789038000000 implements MigrationInterface {
  name = 'AddCustomerPhoneVerification1789038000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE app_users ADD COLUMN "phoneVerified" boolean NOT NULL DEFAULT false');
    await queryRunner.query('UPDATE app_users SET "phoneVerified" = true WHERE "googleSubject" IS NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE app_users DROP COLUMN "phoneVerified"');
  }
}
