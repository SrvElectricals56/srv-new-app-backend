import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMinimumOrderSettings1782607000000 implements MigrationInterface {
  name = 'AddMinimumOrderSettings1782607000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO settings (id, key, value, description, "updatedAt") VALUES
        (gen_random_uuid(), 'minimumOrderAmountElectrician', '5000', 'Minimum product order amount for electrician profiles', now()),
        (gen_random_uuid(), 'minimumOrderAmountDealer', '5000', 'Minimum product order amount for dealer profiles', now()),
        (gen_random_uuid(), 'minimumOrderAmountUser', '5000', 'Minimum product order amount for customer profiles', now()),
        (gen_random_uuid(), 'minimumOrderAmountCounterboy', '5000', 'Minimum product order amount for counter boy profiles', now())
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM settings
      WHERE key IN (
        'minimumOrderAmountElectrician',
        'minimumOrderAmountDealer',
        'minimumOrderAmountUser',
        'minimumOrderAmountCounterboy'
      )
    `);
  }
}
