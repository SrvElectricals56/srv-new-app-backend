import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatingDisplayConsent1785542600000 implements MigrationInterface {
  name = 'AddRatingDisplayConsent1785542600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "app_ratings" ADD COLUMN IF NOT EXISTS "displayConsent" boolean NOT NULL DEFAULT false');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_app_ratings_public_reviews" ON "app_ratings" ("updatedAt" DESC) WHERE "displayConsent" = true AND "review" IS NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_app_ratings_public_reviews"');
    await queryRunner.query('ALTER TABLE "app_ratings" DROP COLUMN IF EXISTS "displayConsent"');
  }
}
