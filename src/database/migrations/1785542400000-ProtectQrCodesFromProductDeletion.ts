import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectQrCodesFromProductDeletion1785542400000 implements MigrationInterface {
  name = 'ProtectQrCodesFromProductDeletion1785542400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        SELECT con.conname INTO constraint_name
        FROM pg_constraint con
        WHERE con.contype = 'f'
          AND con.conrelid = 'qr_codes'::regclass
          AND con.confrelid = 'products'::regclass
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "qr_codes" DROP CONSTRAINT %I', constraint_name);
        END IF;

        ALTER TABLE "qr_codes"
          ADD CONSTRAINT "FK_qr_codes_product_protect"
          FOREIGN KEY ("productId") REFERENCES "products"("id")
          ON DELETE RESTRICT NOT VALID;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "qr_codes" DROP CONSTRAINT IF EXISTS "FK_qr_codes_product_protect";
      ALTER TABLE "qr_codes"
        ADD CONSTRAINT "FK_qr_codes_product_cascade"
        FOREIGN KEY ("productId") REFERENCES "products"("id")
        ON DELETE CASCADE NOT VALID;
    `);
  }
}
