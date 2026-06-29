import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { numericTransformer } from '../numeric.transformer';

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true, nullable: true })
  legacyId: string | null;

  @Column({ unique: true })
  code: string;

  @Column()
  productId: string;

  @Column()
  productName: string;

  @Column({ nullable: true })
  qrImageUrl: string;

  @Column({ default: false })
  isScanned: boolean;

  @Column({ default: 0 })
  scanCount: number;

  @Column({ nullable: true })
  lastScannedBy: string;

  @Column({ nullable: true })
  lastScannedAt: Date;

  @Column({ type: 'integer', nullable: true })
  legacyRedeemerId: number;

  @Column({ nullable: true })
  redeemerName: string;

  @Column({ nullable: true })
  redeemerPhone: string;

  @Column({ nullable: true })
  redeemerCode: string;

  @Column({ nullable: true })
  batchId: string;

  @Column({ type: 'integer', nullable: true })
  batchNo: number;

  @Column({ type: 'integer', nullable: true })
  sequenceNo: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  rewardPoints: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ nullable: true })
  createdBy: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
