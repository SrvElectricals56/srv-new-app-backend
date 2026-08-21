import { MigrationInterface, QueryRunner } from 'typeorm';

export class DecoupleElectricianActivityFromAccessStatus1787117400000 implements MigrationInterface {
  name = 'DecoupleElectricianActivityFromAccessStatus1787117400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Activity (proactive/active/inactive) is calculated from scan dates for
    // reporting only. The account status controls login access and must only
    // change through an explicit admin action. Repair legacy accounts that
    // were automatically inactivated by balance/activity migrations.
    await queryRunner.query(`ALTER TABLE "electricians" ALTER COLUMN "status" SET DEFAULT 'active'`);
    await queryRunner.query(`
      UPDATE "electricians"
      SET "status" = 'active',
          "updatedAt" = now()
      WHERE "status" = 'inactive'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately do not re-lock repaired accounts on rollback.
  }
}
