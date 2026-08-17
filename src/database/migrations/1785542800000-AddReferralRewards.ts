import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralRewards1785542800000 implements MigrationInterface {
  name = 'AddReferralRewards1785542800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "referral_rewards" (
        id uuid PRIMARY KEY,
        "referrerUserId" varchar NOT NULL,
        "referrerRole" varchar(32) NOT NULL,
        "refereeUserId" varchar NOT NULL,
        "refereeRole" varchar(32) NOT NULL,
        "referralCode" varchar(80) NOT NULL,
        points numeric(10,2) NOT NULL DEFAULT 20,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_referral_rewards_referee" UNIQUE ("refereeUserId", "refereeRole")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_referral_rewards_referrer" ON "referral_rewards" ("referrerUserId", "referrerRole")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_rewards"`);
  }
}
