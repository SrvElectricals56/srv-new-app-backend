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
  OUT_FOR_DELIVERY = 'out_for_delivery',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
  REFUNDED = 'refunded',
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

  @Column({ nullable: true })
  courierName: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ default: 'cod' })
  paymentMethod: string;

  @Column({ default: 'pending' })
  paymentStatus: string;

  @Column({ nullable: true })
  razorpayOrderId: string;

  @Column({ nullable: true })
  razorpayPaymentId: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date;

  @Column({ type: 'text', nullable: true })
  paymentFailureReason: string;

  @Column({ type: 'timestamptz', nullable: true })
  estimatedDeliveryAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date;

  @Column({ nullable: true })
  refundStatus: string;

  @Column({ type: 'text', nullable: true })
  refundMessage: string;

  @Column({ type: 'text', nullable: true })
  deliveryNotes: string;

  @CreateDateColumn({ type: 'timestamptz' })
  orderedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
