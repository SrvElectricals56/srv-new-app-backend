import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeAdminEmailOptional1783497600000 implements MigrationInterface {
  name = 'MakeAdminEmailOptional1783497600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "admins" ALTER COLUMN "email" DROP NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "admins" SET "email" = CONCAT('admin-', "id", '@placeholder.local') WHERE "email" IS NULL`,
    );
    await queryRunner.query('ALTER TABLE "admins" ALTER COLUMN "email" SET NOT NULL');
  }
}
