import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../common/enums';

@Entity('product_cart_items')
export class ProductCartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  userRole: UserRole;

  @Column()
  userName: string;

  @Column({ nullable: true })
  userPhone: string;

  @Column({ nullable: true })
  userCode: string;

  @Column()
  productId: string;

  @Column()
  productName: string;

  @Column({ nullable: true })
  productImage: string;

  @Column({ default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @CreateDateColumn()
  addedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
