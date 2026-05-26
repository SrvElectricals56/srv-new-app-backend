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

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ nullable: true })
  batchId: string;

  @Column({ type: 'integer', nullable: true })
  batchNo: number;

  @Column({ type: 'integer', nullable: true })
  sequenceNo: number;

  @Column({ type: 'integer', default: 0 })
  rewardPoints: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
