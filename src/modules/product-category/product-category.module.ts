import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategoryController } from './product-category.controller';
import { ProductCategoryService } from './product-category.service';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { Product } from '../../database/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductCategory, Product])],
  controllers: [ProductCategoryController],
  providers: [ProductCategoryService],
  exports: [ProductCategoryService],
})
export class ProductCategoryModule {}
