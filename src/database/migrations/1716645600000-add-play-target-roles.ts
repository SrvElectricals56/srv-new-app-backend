import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayTargetRoles1716645600000 implements MigrationInterface {
  name = 'AddPlayTargetRoles1716645600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "targetRoles" text[]
    `);

    await queryRunner.query(`
      UPDATE "plays"
      SET "targetRoles" = ARRAY['user']
      WHERE "targetRoles" IS NULL OR cardinality("targetRoles") = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "targetRoles"
    `);
  }
}
