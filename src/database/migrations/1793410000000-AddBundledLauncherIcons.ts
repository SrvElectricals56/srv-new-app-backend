import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBundledLauncherIcons1793410000000 implements MigrationInterface {
  name = 'AddBundledLauncherIcons1793410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_icons" ADD COLUMN IF NOT EXISTS "nativeKey" character varying`);
    await queryRunner.query(`
      UPDATE "app_icons"
      SET "nativeKey" = CASE
        WHEN lower("name") LIKE '%diwali%' THEN 'diwali'
        WHEN lower("name") LIKE '%republic%' OR lower("name") LIKE '%26 january%' THEN 'republic-day'
        WHEN lower("name") LIKE '%default%' OR lower("name") LIKE '%srv%' THEN 'default'
        ELSE NULL
      END
      WHERE "nativeKey" IS NULL
    `);
    await queryRunner.query(`
      WITH duplicates AS (
        SELECT "id", row_number() OVER (PARTITION BY "nativeKey" ORDER BY "isActive" DESC, "updatedAt" DESC) AS row_number
        FROM "app_icons"
        WHERE "nativeKey" IS NOT NULL
      )
      UPDATE "app_icons" AS icon
      SET "nativeKey" = NULL, "isActive" = false
      FROM duplicates
      WHERE icon."id" = duplicates."id" AND duplicates.row_number > 1
    `);
    await queryRunner.query(`UPDATE "app_icons" SET "isActive" = false WHERE "isActive" = true AND "nativeKey" IS NULL`);
    await queryRunner.query(`
      INSERT INTO "app_icons" ("id", "name", "imageUrl", "nativeKey", "isActive", "displayOrder", "createdAt", "updatedAt")
      SELECT '00000000-0000-4000-8000-000000000001', 'Default SRV', '/app-icons/default.png', 'default',
             NOT EXISTS (SELECT 1 FROM "app_icons" WHERE "isActive" = true), 0, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM "app_icons" WHERE "nativeKey" = 'default')
    `);
    await queryRunner.query(`
      INSERT INTO "app_icons" ("id", "name", "imageUrl", "nativeKey", "isActive", "displayOrder", "createdAt", "updatedAt")
      SELECT '00000000-0000-4000-8000-000000000002', 'Diwali', '/app-icons/diwali.png', 'diwali', false, 10, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM "app_icons" WHERE "nativeKey" = 'diwali')
    `);
    await queryRunner.query(`
      INSERT INTO "app_icons" ("id", "name", "imageUrl", "nativeKey", "isActive", "displayOrder", "createdAt", "updatedAt")
      SELECT '00000000-0000-4000-8000-000000000003', 'Republic Day (26 January)', '/app-icons/republic-day.png', 'republic-day', false, 20, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM "app_icons" WHERE "nativeKey" = 'republic-day')
    `);
    await queryRunner.query(`
      UPDATE "app_icons"
      SET "isActive" = true
      WHERE "nativeKey" = 'default'
        AND NOT EXISTS (SELECT 1 FROM "app_icons" WHERE "isActive" = true)
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_app_icons_native_key" ON "app_icons" ("nativeKey") WHERE "nativeKey" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_app_icons_native_key"`);
    await queryRunner.query(`DELETE FROM "app_icons" WHERE "id" IN ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003')`);
    await queryRunner.query(`ALTER TABLE "app_icons" DROP COLUMN IF EXISTS "nativeKey"`);
  }
}
