import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductOrderCustomerRequestFields1782610000000 implements MigrationInterface {
  name = 'AddProductOrderCustomerRequestFields1782610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_orders" ADD COLUMN IF NOT EXISTS "cancelReason" text`);
    await queryRunner.query(`ALTER TABLE "product_orders" ADD COLUMN IF NOT EXISTS "returnReason" text`);
    await queryRunner.query(`ALTER TABLE "product_orders" ADD COLUMN IF NOT EXISTS "refundReason" text`);
    await queryRunner.query(`ALTER TABLE "product_orders" ADD COLUMN IF NOT EXISTS "customerActionAt" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_orders" DROP COLUMN IF EXISTS "customerActionAt"`);
    await queryRunner.query(`ALTER TABLE "product_orders" DROP COLUMN IF EXISTS "refundReason"`);
    await queryRunner.query(`ALTER TABLE "product_orders" DROP COLUMN IF EXISTS "returnReason"`);
    await queryRunner.query(`ALTER TABLE "product_orders" DROP COLUMN IF EXISTS "cancelReason"`);
  }
}
