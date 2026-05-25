import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { Product } from '../../database/entities/product.entity';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

@Injectable()
export class ProductCategoryService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(createDto: CreateProductCategoryDto): Promise<ProductCategory> {
    const category = this.categoryRepository.create(createDto);
    return await this.categoryRepository.save(category);
  }

  async findAll(): Promise<any[]> {
    const categories = await this.categoryRepository.find({
      order: { sortOrder: 'ASC', label: 'ASC' },
    });

    // Count products per category by matching product.category string to category.label
    const counts: { category: string; count: string }[] = await this.productRepository
      .createQueryBuilder('product')
      .select('product.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('product.category')
      .getRawMany();

    const countMap = new Map(counts.map(r => [r.category, parseInt(r.count, 10)]));

    return categories.map(cat => ({
      ...cat,
      productCount: countMap.get(cat.label) ?? 0,
    }));
  }

  async findOne(id: string): Promise<ProductCategory> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Product category with ID ${id} not found`);
    }
    return category;
  }

  async update(id: string, updateDto: UpdateProductCategoryDto): Promise<ProductCategory> {
    const category = await this.findOne(id);
    Object.assign(category, updateDto);
    return await this.categoryRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
  }
}
