import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../common/enums';

export enum ProductOrderStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  REJECTED = 'rejected',
}

@Entity('product_orders')
export class ProductOrder {
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

  @Column({
    type: 'enum',
    enum: ProductOrderStatus,
    default: ProductOrderStatus.PENDING,
  })
  status: ProductOrderStatus;

  @Column({ type: 'text', nullable: true })
  shippingAddress: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @CreateDateColumn()
  orderedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
