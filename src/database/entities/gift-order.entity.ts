import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserRole } from '../../common/enums';

export enum GiftOrderStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  REJECTED = 'rejected',
}

@Entity('gift_orders')
export class GiftOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column({ nullable: true })
  userCode: string;

  @Column({ nullable: true })
  dealerName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column()
  giftProductId: string;

  @Column()
  giftName: string;

  @Column({ nullable: true })
  giftImage: string;

  @Column({ default: 0 })
  pointsUsed: number;

  @Column({
    type: 'enum',
    enum: GiftOrderStatus,
    default: GiftOrderStatus.PENDING,
  })
  status: GiftOrderStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ nullable: true })
  processedBy: string;

  @Column({ nullable: true })
  processedAt: Date;

  @Column({ nullable: true })
  shippingAddress: string;

  @Column({ nullable: true })
  trackingNumber: string;

  @CreateDateColumn({ type: 'timestamptz' })
  orderedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
