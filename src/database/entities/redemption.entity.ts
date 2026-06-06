import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RedemptionStatus, UserRole } from '../../common/enums';

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

  @Column({ default: 0 })
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
