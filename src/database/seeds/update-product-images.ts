/**
 * Update Product Images Script
 * This script updates product images in the database with real image URLs
 * 
 * Usage: npx ts-node -r tsconfig-paths/register src/database/seeds/update-product-images.ts
 */

import { DataSource } from 'typeorm';
import { Product } from '../entities/product.entity';

// Real product images mapping (category-based or product name-based)
const PRODUCT_IMAGES: Record<string, string> = {
  // Fan Box products
  'fanbox': 'https://srvelectricals.com/cdn/shop/files/FC_4_17-30.png?v=1757426626&width=600',
  
  // Concealed Box products
  'concealedbox': 'https://srvelectricals.com/cdn/shop/files/CRD_PL_3.png?v=1757426566&width=600',
  
  // Modular Box products
  'modular': 'https://srvelectricals.com/cdn/shop/files/3x3_679e5d30-ecf2-446e-9452-354bbf4c4a26.png?v=1757426377&width=600',
  
  // MCB Box products
  'mcb': 'https://srvelectricals.com/cdn/shop/files/MCB_Box_4_Way_GI.png?v=1757426418&width=600',
  
  // Bus Bar products
  'busbar': 'https://srvelectricals.com/cdn/shop/files/Bus_Bar_100A_Super.png?v=1757426672&width=600',
  
  // Exhaust Fan products
  'exhaust': 'https://srvelectricals.com/cdn/shop/files/AP-Turtle-Fan.webp?v=1747938680&width=600',
  'axialfan': 'https://srvelectricals.com/cdn/shop/files/AP-Turtle-Fan.webp?v=1747938680&width=600',
  
  // LED products
  'led': 'https://srvelectricals.com/cdn/shop/files/FloodLightSleek.png?v=1757426471&width=600',
  
  // Changeover products
  'changeover': 'https://srvelectricals.com/cdn/shop/files/ACO_100A_FP.png?v=1757426480&width=600',
  
  // Main Switch products
  'mainswitch': 'https://srvelectricals.com/cdn/shop/files/CO_32A_DP_PRM.png?v=1757426515&width=600',
  
  // Louver products
  'louver': 'https://srvelectricals.com/cdn/shop/files/Louver_6_inch.png?v=1757426390&width=600',
  
  // Conduit/PVC Pipe products
  'conduit': 'https://cdn.shopify.com/s/files/1/0651/4583/1466/files/PVCPipe_d645973b-bd5e-41de-8eb0-53331cce1c19.png?v=1772786167',
  'pvcpipe': 'https://cdn.shopify.com/s/files/1/0651/4583/1466/files/PVCPipe_d645973b-bd5e-41de-8eb0-53331cce1c19.png?v=1772786167',
  
  // Stabilizer products
  'stabilizer': 'https://srvelectricals.com/cdn/shop/files/VoltageStabilizer.png?v=1757426471&width=600',
  
  // Junction Box products
  'junction': 'https://srvelectricals.com/cdn/shop/files/Junction_Box.png?v=1757426390&width=600',
};

// Normalize category name
function normalizeCategory(category: string): string {
  return category.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}

// Get image URL for a product based on its category
function getImageForProduct(product: Product): string | null {
  const normalizedCategory = normalizeCategory(product.category);
  
  // Check if we have an image for this category
  if (PRODUCT_IMAGES[normalizedCategory]) {
    return PRODUCT_IMAGES[normalizedCategory];
  }
  
  // Check for aliases
  const aliases: Record<string, string> = {
    'modularbox': 'modular',
    'ledflood': 'led',
    'boxes': 'mcb',
    'fans': 'exhaust',
  };
  
  if (aliases[normalizedCategory] && PRODUCT_IMAGES[aliases[normalizedCategory]]) {
    return PRODUCT_IMAGES[aliases[normalizedCategory]];
  }
  
  return null;
}

async function updateProductImages() {
  // Create database connection
  const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '4268',
    database: process.env.DB_DATABASE || 'srv_admin',
    entities: [Product],
    synchronize: false,
  });

  try {
    console.log('🔌 Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Database connected');

    const productRepo = AppDataSource.getRepository(Product);

    // Get all products
    const products = await productRepo.find();
    console.log(`📦 Found ${products.length} products`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      // Skip if product already has an image
      if (product.image && product.image.trim()) {
        console.log(`⏭️  Skipping "${product.name}" - already has image`);
        skippedCount++;
        continue;
      }

      // Get image URL for this product
      const imageUrl = getImageForProduct(product);

      if (imageUrl) {
        await productRepo.update(product.id, { image: imageUrl });
        console.log(`✅ Updated "${product.name}" (${product.category}) with image`);
        updatedCount++;
      } else {
        console.log(`⚠️  No image found for "${product.name}" (${product.category})`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total products: ${products.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped (already had images): ${skippedCount}`);
    console.log(`   No image available: ${products.length - updatedCount - skippedCount}`);

    await AppDataSource.destroy();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
updateProductImages();
