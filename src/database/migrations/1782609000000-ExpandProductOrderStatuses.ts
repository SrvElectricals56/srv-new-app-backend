import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandProductOrderStatuses1782609000000 implements MigrationInterface {
  name = 'ExpandProductOrderStatuses1782609000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Legacy imports stored this field as varchar, which already accepts the
        -- expanded values. Fresh installations use the TypeORM enum.
        IF to_regtype('public.product_orders_status_enum') IS NOT NULL THEN
          ALTER TYPE "public"."product_orders_status_enum"
            ADD VALUE IF NOT EXISTS 'out_for_delivery';
          ALTER TYPE "public"."product_orders_status_enum"
            ADD VALUE IF NOT EXISTS 'cancelled';
          ALTER TYPE "public"."product_orders_status_enum"
            ADD VALUE IF NOT EXISTS 'returned';
          ALTER TYPE "public"."product_orders_status_enum"
            ADD VALUE IF NOT EXISTS 'refunded';
        END IF;
      END
      $$
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
