import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeDealerAssociationLookups1787310100000 implements MigrationInterface {
  name = 'OptimizeDealerAssociationLookups1787310100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_electricians_fallback_dealer_code_normalized"
      ON "electricians" (upper(btrim("fallbackDealerCode")))
      WHERE "dealerId" IS NULL AND NULLIF(btrim("fallbackDealerCode"), '') IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_electricians_fallback_dealer_phone_normalized"
      ON "electricians" (RIGHT(regexp_replace(COALESCE("fallbackDealerPhone", ''), '\\D', '', 'g'), 10))
      WHERE "dealerId" IS NULL AND NULLIF(btrim("fallbackDealerPhone"), '') IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_electricians_fallback_dealer_phone_normalized"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_electricians_fallback_dealer_code_normalized"');
  }
}
