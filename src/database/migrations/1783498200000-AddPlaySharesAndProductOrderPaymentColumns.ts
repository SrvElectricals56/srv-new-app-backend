import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlaySharesAndProductOrderPaymentColumns1783498200000
  implements MigrationInterface
{
  name = 'AddPlaySharesAndProductOrderPaymentColumns1783498200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plays"
      ADD COLUMN IF NOT EXISTS "shares" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paymentMethod" varchar NOT NULL DEFAULT 'cod'
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paymentStatus" varchar NOT NULL DEFAULT 'pending'
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "razorpayOrderId" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "razorpayPaymentId" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paidAt" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paymentFailureReason" text
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "estimatedDeliveryAt" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "dispatchedAt" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "rejectedAt" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "refundStatus" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "refundMessage" text
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "deliveryNotes" text
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_orders_razorpay_order"
      ON "product_orders" ("razorpayOrderId")
      WHERE "razorpayOrderId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_orders_razorpay_payment"
      ON "product_orders" ("razorpayPaymentId")
      WHERE "razorpayPaymentId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_orders_razorpay_payment"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_orders_razorpay_order"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "deliveryNotes"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "refundMessage"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "refundStatus"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "rejectedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "deliveredAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "dispatchedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "estimatedDeliveryAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "paymentFailureReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "paidAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "razorpayPaymentId"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "razorpayOrderId"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "paymentStatus"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "paymentMethod"
    `);
    await queryRunner.query(`
      ALTER TABLE "plays"
      DROP COLUMN IF EXISTS "shares"
    `);
  }
}
