import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminListIndexes1785542900000 implements MigrationInterface {
  name = 'AddAdminListIndexes1785542900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_admin_list" ON "electricians" ("joinedDate" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_dealer_id" ON "electricians" ("dealerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_app_installed_login" ON "electricians" ("appInstalled", "firstAppLoginAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_electricians_status_tier" ON "electricians" ("status", "tier")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dealers_admin_list" ON "dealers" ("joinedDate" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_dealers_app_installed_login" ON "dealers" ("appInstalled", "firstAppLoginAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_app_users_admin_list" ON "app_users" ("joinedDate" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_counterboys_admin_list" ON "counterboys" ("joinedDate" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_counterboys_admin_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_app_users_admin_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dealers_app_installed_login"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dealers_admin_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_electricians_status_tier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_electricians_app_installed_login"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_electricians_dealer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_electricians_admin_list"`);
  }
}
