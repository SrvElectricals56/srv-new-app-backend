import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../numeric.transformer';
import { Product } from './product.entity';

@Entity('product_variants')
@Index(['productId'])
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true, nullable: true })
  legacyId: string | null;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'integer', default: 0 })
  measurement: number;

  @Column({ type: 'integer', default: 0 })
  quantity: number;

  @Column({ nullable: true })
  unit: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  discountedPrice: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  originalPrice: number;

  @Column({ type: 'integer', default: 0 })
  stock: number;

  @Column({ type: 'integer', default: 0 })
  soldQuantity: number;

  @Column({ default: true })
  isActive: boolean;
}
