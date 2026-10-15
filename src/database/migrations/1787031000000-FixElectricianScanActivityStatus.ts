import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixElectricianScanActivityStatus1787031000000 implements MigrationInterface {
  name = 'FixElectricianScanActivityStatus1787031000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "electricians" ALTER COLUMN "status" SET DEFAULT 'active'`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scans_electrician_activity"
      ON "scans" ("userId", "scannedAt" DESC)
      WHERE "role" = 'electrician'
    `);
    // Legacy imports use the shared "UserStatus" enum while clean installs use
    // electricians_status_enum. Assigning enum literals directly keeps this
    // migration compatible with both schemas; hard-casting to either enum does
    // not.
    await queryRunner.query(`
      UPDATE "electricians" AS e
      SET "status" = 'active', "updatedAt" = now()
      WHERE e."status" NOT IN ('pending', 'suspended')
        AND (
          e."joinedDate" >= now() - interval '30 days'
          OR EXISTS (
            SELECT 1 FROM "scans" AS s
            WHERE s."role" = 'electrician'
              AND s."userId" = e.id::text
              AND s."scannedAt" >= now() - interval '30 days'
          )
        )
    `);
    await queryRunner.query(`
      UPDATE "electricians" AS e
      SET "status" = 'inactive', "updatedAt" = now()
      WHERE e."status" NOT IN ('pending', 'suspended')
        AND NOT (
          e."joinedDate" >= now() - interval '30 days'
          OR EXISTS (
            SELECT 1 FROM "scans" AS s
            WHERE s."role" = 'electrician'
              AND s."userId" = e.id::text
              AND s."scannedAt" >= now() - interval '30 days'
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scans_electrician_activity"`);
  }
}
