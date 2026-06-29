import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariants1782602000000 implements MigrationInterface {
  name = 'AddProductVariants1782602000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "legacyId" bigint UNIQUE,
        "productId" uuid NOT NULL,
        "measurement" integer NOT NULL DEFAULT 0,
        "quantity" integer NOT NULL DEFAULT 0,
        "unit" varchar,
        "discountedPrice" numeric(12,2) NOT NULL DEFAULT 0,
        "originalPrice" numeric(12,2) NOT NULL DEFAULT 0,
        "stock" integer NOT NULL DEFAULT 0,
        "soldQuantity" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "FK_product_variants_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_product_variants_productId"
      ON "product_variants" ("productId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "product_variants"');
  }
}
