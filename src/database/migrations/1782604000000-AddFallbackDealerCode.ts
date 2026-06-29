import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFallbackDealerCode1782604000000 implements MigrationInterface {
  name = 'AddFallbackDealerCode1782604000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "electricians"
      ADD COLUMN IF NOT EXISTS "fallbackDealerCode" character varying
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_electricians_fallback_dealer_code"
      ON "electricians" ("fallbackDealerCode")
      WHERE "dealerId" IS NULL AND "fallbackDealerCode" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_electricians_fallback_dealer_code"');
    await queryRunner.query('ALTER TABLE "electricians" DROP COLUMN IF EXISTS "fallbackDealerCode"');
  }
}
