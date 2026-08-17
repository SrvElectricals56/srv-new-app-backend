import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetElectricianActivityStatus1785542700000 implements MigrationInterface {
  name = 'SetElectricianActivityStatus1785542700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "electricians" ALTER COLUMN "status" SET DEFAULT 'inactive'`);
    await queryRunner.query(`
      UPDATE "electricians"
      SET "status" = 'inactive', "updatedAt" = now()
      WHERE "status" = 'active'
        AND COALESCE("totalPoints", 0) = 0
        AND COALESCE("walletBalance", 0) = 0
        AND COALESCE("totalScans", 0) = 0
    `);
    await queryRunner.query(`
      UPDATE "electricians"
      SET "status" = 'active', "updatedAt" = now()
      WHERE "status" = 'inactive'
        AND (
          COALESCE("totalPoints", 0) > 0 OR
          COALESCE("walletBalance", 0) > 0 OR
          COALESCE("totalScans", 0) > 0
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "electricians" ALTER COLUMN "status" SET DEFAULT 'active'`);
  }
}
