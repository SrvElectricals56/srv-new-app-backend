import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductCategoryProductCount1783497900000 implements MigrationInterface {
  name = 'AddProductCategoryProductCount1783497900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "productCount" integer',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "productCount"',
    );
  }
}
