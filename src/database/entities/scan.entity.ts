import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ScanMode, UserRole } from '../../common/enums';
import { Product } from './product.entity';
import { numericTransformer } from '../numeric.transformer';

@Entity('scans')
export class Scan {
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
  productId: string;

  @Column()
  productName: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  points: number;

  @Column({
    type: 'enum',
    enum: ScanMode,
    default: ScanMode.SINGLE,
  })
  mode: ScanMode;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  latitude: string;

  @Column({ nullable: true })
  longitude: string;

  @Column({ nullable: true })
  qrCodeId: string;

  @ManyToOne(() => Product, (product) => product.scans, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @CreateDateColumn({ type: 'timestamptz' })
  scannedAt: Date;
}
