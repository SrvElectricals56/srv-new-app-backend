import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from '../../database/entities/product.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async create(createProductDto: CreateProductDto) {
    if (createProductDto.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: createProductDto.sku },
      });
      if (existingProduct) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    // Normalize aliases: imageUrl → image, pointsValue → points, description → sub
    const data: any = { ...createProductDto };
    if (!data.image && data.imageUrl) { data.image = data.imageUrl; }
    if (!data.points && data.pointsValue) { data.points = data.pointsValue; }
    if (!data.sub && data.description) { data.sub = data.description; }
    // Remove alias keys so they don't hit the entity
    delete data.imageUrl;
    delete data.pointsValue;
    // keep description as-is (entity has description column too)

    const product = this.productRepository.create(data);
    return this.productRepository.save(product);
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    category?: string,
    isActive?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.productRepository.createQueryBuilder('product');

    // Always exclude gift products — they are managed via the Gift Management module
    queryBuilder.andWhere('product.category != :giftCat', { giftCat: 'gift' });

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.category ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (category) {
      queryBuilder.andWhere('product.category = :category', { category });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('product.isActive = :isActive', { isActive });
    }

    queryBuilder
      .orderBy('product.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.findOne(id);

    if (updateProductDto.sku && updateProductDto.sku !== product.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: updateProductDto.sku },
      });
      if (existingProduct) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    // Normalize aliases
    const data: any = { ...updateProductDto };
    if (!data.image && data.imageUrl) { data.image = data.imageUrl; }
    if (!data.points && data.pointsValue) { data.points = data.pointsValue; }
    if (!data.sub && data.description) { data.sub = data.description; }
    delete data.imageUrl;
    delete data.pointsValue;

    await this.productRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
    return { message: 'Product deleted successfully' };
  }
}