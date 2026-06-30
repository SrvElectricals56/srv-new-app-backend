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
    const data = this.prepareWriteBody(createProductDto);

    if (data.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: data.sku },
      });
      if (existingProduct) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

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

    // Gift products are managed through the Gift Management module.
    queryBuilder.andWhere('product.category != :giftCat', { giftCat: 'gift' });

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.category ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${search}%` },
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
    const data = this.prepareWriteBody(updateProductDto);

    if (data.sku && data.sku !== product.sku) {
      const existingProduct = await this.productRepository.findOne({
        where: { sku: data.sku },
      });
      if (existingProduct) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    await this.productRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
    return { message: 'Product deleted successfully' };
  }

  private prepareWriteBody(dto: CreateProductDto | UpdateProductDto): Partial<Product> {
    const data: any = { ...dto };

    if (!data.image && data.imageUrl) data.image = data.imageUrl;
    if (!data.points && data.pointsValue) data.points = data.pointsValue;
    if (!data.sub && data.description) data.sub = data.description;

    if (typeof data.sku === 'string') {
      const normalizedSku = data.sku.trim();
      data.sku = normalizedSku.length ? normalizedSku : null;
    }

    delete data.imageUrl;
    delete data.pointsValue;

    return data;
  }
}
