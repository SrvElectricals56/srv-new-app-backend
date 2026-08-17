import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleSubjectToAppUsers1785542500000 implements MigrationInterface {
  name = 'AddGoogleSubjectToAppUsers1785542500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "googleSubject" varchar');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_app_users_google_subject" ON "app_users" ("googleSubject") WHERE "googleSubject" IS NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_app_users_google_subject"');
    await queryRunner.query('ALTER TABLE "app_users" DROP COLUMN IF EXISTS "googleSubject"');
  }
}
