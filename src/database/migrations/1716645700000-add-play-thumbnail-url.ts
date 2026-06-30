import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayThumbnailUrl1716645700000 implements MigrationInterface {
  name = 'AddPlayThumbnailUrl1716645700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "thumbnailUrl" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "thumbnailUrl"
    `);
  }
}
