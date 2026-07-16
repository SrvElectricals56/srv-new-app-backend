import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayExternalMetadata1784000000000 implements MigrationInterface {
  name = 'AddPlayExternalMetadata1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "externalSource" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "externalId" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "externalPermalink" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "externalPublishedAt" timestamptz
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plays_external_source_id"
      ON "plays" ("externalSource", "externalId")
      WHERE "externalSource" IS NOT NULL AND "externalId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plays_external_source_id"`);
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "externalPublishedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "externalPermalink"
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "externalId"
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "externalSource"
    `);
  }
}
