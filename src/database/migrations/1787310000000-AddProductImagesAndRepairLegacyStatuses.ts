import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImagesAndRepairLegacyStatuses1787310000000 implements MigrationInterface {
  name = 'AddProductImagesAndRepairLegacyStatuses1787310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "images" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`
      UPDATE "products"
      SET "images" = jsonb_build_array("image")
      WHERE COALESCE(BTRIM("image"), '') <> '' AND jsonb_array_length("images") = 0
    `);
    await queryRunner.query(`
      UPDATE "redemptions"
      SET "status" = 'approved', "processedAt" = COALESCE("processedAt", "updatedAt", now())
      WHERE "status" = 'pending'
        AND "role" IN ('electrician', 'dealer')
        AND "requestedAt" < TIMESTAMPTZ '2026-08-21 00:00:00+05:30'
    `);
    await queryRunner.query(`
      UPDATE "dealers"
      SET "bonusStatus" = 'paid'
      WHERE "bonusStatus" = 'pending' AND COALESCE("bonuspoints", 0) = 0
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_redemptions_role_status_requested" ON "redemptions" ("role", "status", "requestedAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_orders_refund_status" ON "product_orders" ("refundStatus", "status", "orderedAt" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_orders_refund_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_redemptions_role_status_requested"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "images"`);
  }
}
