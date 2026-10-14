import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkGiftOrdersToRedemptions1790941200000 implements MigrationInterface {
  name = 'LinkGiftOrdersToRedemptions1790941200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "gift_orders" ADD COLUMN "redemptionId" uuid');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_gift_orders_redemptionId" ON "gift_orders" ("redemptionId") WHERE "redemptionId" IS NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_gift_orders_redemptionId"');
    await queryRunner.query('ALTER TABLE "gift_orders" DROP COLUMN "redemptionId"');
  }
}
