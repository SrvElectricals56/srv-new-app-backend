import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RedemptionStatus, UserRole } from '../../common/enums';
import { numericTransformer } from '../numeric.transformer';

@Entity('redemptions')
export class Redemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column()
  type: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericTransformer })
  points: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number;

  @Column({
    type: 'enum',
    enum: RedemptionStatus,
    default: RedemptionStatus.PENDING,
  })
  status: RedemptionStatus;

  @Column({ nullable: true })
  upiId: string;

  @Column({ nullable: true })
  bankAccount: string;

  @Column({ nullable: true })
  ifsc: string;

  @Column({ nullable: true })
  accountHolderName: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ name: 'giftproductid', nullable: true })
  giftProductId: string;

  @Column({ name: 'giftname', nullable: true })
  giftName: string;

  @Column({ name: 'giftimage', type: 'text', nullable: true })
  giftImage: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ nullable: true })
  processedBy: string;

  @Column({ nullable: true })
  processedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  requestedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
