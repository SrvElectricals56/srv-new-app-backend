import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenamePrimaryAdminToRadheRadhe1793500000000 implements MigrationInterface {
  name = 'RenamePrimaryAdminToRadheRadhe1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admins"
      SET "name" = 'Radhe Radhe', "updatedAt" = NOW()
      WHERE "role" = 'super_admin'
        AND ("email" = 'admin@srvelectricals.com' OR "phone" = '9162038214')
        AND regexp_replace(lower("name"), '[^a-z]', '', 'g') IN (
          'harshvardhan',
          'harshvardhansingh'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admins"
      SET "name" = 'Harsh Vardhan', "updatedAt" = NOW()
      WHERE "role" = 'super_admin'
        AND ("email" = 'admin@srvelectricals.com' OR "phone" = '9162038214')
        AND "name" = 'Radhe Radhe'
    `);
  }
}
