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
    await queryRunner.query(`
      UPDATE "electricians" AS e
      SET "status" = CASE
            WHEN e."joinedDate" >= now() - interval '30 days'
              OR EXISTS (
                SELECT 1 FROM "scans" AS s
                WHERE s."role" = 'electrician'
                  AND s."userId" = e.id::text
                  AND s."scannedAt" >= now() - interval '30 days'
              )
            THEN 'active'::electricians_status_enum
            ELSE 'inactive'::electricians_status_enum
          END,
          "updatedAt" = now()
      WHERE e."status" NOT IN ('pending', 'suspended')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scans_electrician_activity"`);
  }
}
