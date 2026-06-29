import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseDecimalRewardBalances1782601000000
  implements MigrationInterface
{
  name = 'UseDecimalRewardBalances1782601000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ALTER COLUMN "points" TYPE numeric(12,2) USING "points"::numeric;
      ALTER TABLE "points_config"
        ALTER COLUMN "basePoints" TYPE numeric(12,2) USING "basePoints"::numeric,
        ALTER COLUMN "bonusPoints" TYPE numeric(12,2) USING "bonusPoints"::numeric;
      ALTER TABLE "offers"
        ALTER COLUMN "bonusPoints" TYPE numeric(12,2) USING "bonusPoints"::numeric;
      ALTER TABLE "redemptions"
        ALTER COLUMN "points" TYPE numeric(14,2) USING "points"::numeric;
      ALTER TABLE "gift_orders"
        ALTER COLUMN "pointsUsed" TYPE numeric(14,2) USING "pointsUsed"::numeric;
      ALTER TABLE "electricians"
        ALTER COLUMN "totalPoints" TYPE numeric(14,2) USING "totalPoints"::numeric,
        ALTER COLUMN "walletBalance" TYPE numeric(14,2) USING "walletBalance"::numeric;
      ALTER TABLE "dealers"
        ALTER COLUMN "walletBalance" TYPE numeric(14,2) USING "walletBalance"::numeric,
        ALTER COLUMN "bonuspoints" TYPE numeric(14,2) USING "bonuspoints"::numeric;
      ALTER TABLE "app_users"
        ALTER COLUMN "totalPoints" TYPE numeric(14,2) USING "totalPoints"::numeric,
        ALTER COLUMN "walletBalance" TYPE numeric(14,2) USING "walletBalance"::numeric;
      ALTER TABLE "counterboys"
        ALTER COLUMN "totalPoints" TYPE numeric(14,2) USING "totalPoints"::numeric,
        ALTER COLUMN "walletBalance" TYPE numeric(14,2) USING "walletBalance"::numeric;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
        ALTER COLUMN "points" TYPE integer USING round("points")::integer;
      ALTER TABLE "points_config"
        ALTER COLUMN "basePoints" TYPE integer USING round("basePoints")::integer,
        ALTER COLUMN "bonusPoints" TYPE integer USING round("bonusPoints")::integer;
      ALTER TABLE "offers"
        ALTER COLUMN "bonusPoints" TYPE integer USING round("bonusPoints")::integer;
      ALTER TABLE "redemptions"
        ALTER COLUMN "points" TYPE integer USING round("points")::integer;
      ALTER TABLE "gift_orders"
        ALTER COLUMN "pointsUsed" TYPE integer USING round("pointsUsed")::integer;
      ALTER TABLE "electricians"
        ALTER COLUMN "totalPoints" TYPE integer USING round("totalPoints")::integer,
        ALTER COLUMN "walletBalance" TYPE integer USING round("walletBalance")::integer;
      ALTER TABLE "dealers"
        ALTER COLUMN "walletBalance" TYPE integer USING round("walletBalance")::integer,
        ALTER COLUMN "bonuspoints" TYPE numeric(10,2) USING "bonuspoints"::numeric;
      ALTER TABLE "app_users"
        ALTER COLUMN "totalPoints" TYPE integer USING round("totalPoints")::integer,
        ALTER COLUMN "walletBalance" TYPE integer USING round("walletBalance")::integer;
      ALTER TABLE "counterboys"
        ALTER COLUMN "totalPoints" TYPE integer USING round("totalPoints")::integer,
        ALTER COLUMN "walletBalance" TYPE integer USING round("walletBalance")::integer;
    `);
  }
}
