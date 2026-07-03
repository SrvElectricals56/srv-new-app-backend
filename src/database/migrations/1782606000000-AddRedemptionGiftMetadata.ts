import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRedemptionGiftMetadata1782606000000
  implements MigrationInterface
{
  name = 'AddRedemptionGiftMetadata1782606000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "redemptions"
      ADD COLUMN IF NOT EXISTS "giftproductid" varchar,
      ADD COLUMN IF NOT EXISTS "giftname" varchar,
      ADD COLUMN IF NOT EXISTS "giftimage" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "redemptions"
      DROP COLUMN IF EXISTS "giftimage",
      DROP COLUMN IF EXISTS "giftname",
      DROP COLUMN IF EXISTS "giftproductid"
    `);
  }
}
