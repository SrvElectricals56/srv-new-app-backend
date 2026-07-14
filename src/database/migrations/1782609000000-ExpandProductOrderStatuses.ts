import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandProductOrderStatuses1782609000000 implements MigrationInterface {
  name = 'ExpandProductOrderStatuses1782609000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."product_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'out_for_delivery'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."product_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'cancelled'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."product_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'returned'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."product_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'refunded'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "product_orders"
      SET "status" = 'rejected'
      WHERE "status" IN ('cancelled', 'returned', 'refunded')
    `);
    await queryRunner.query(`
      UPDATE "product_orders"
      SET "status" = 'shipped'
      WHERE "status" = 'out_for_delivery'
    `);
  }
}
