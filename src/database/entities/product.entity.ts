import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Scan } from './scan.entity';
import { PointsConfig } from './points-config.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  sub: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  subCategory: string;

  @Column({ nullable: true })
  image: string;

  @Column({ default: 0 })
  points: number;

  @Column({ nullable: true })
  badge: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  mrp: number;

  @Column({ default: 0 })
  stock: number;

  @Column({ default: 0 })
  totalScanned: number;

  @Column({ unique: true, nullable: true })
  sku: string;

  @Column({ nullable: true })
  weight: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Scan, (scan) => scan.product)
  scans: Scan[];

  @OneToMany(() => PointsConfig, (config) => config.product)
  pointsConfigs: PointsConfig[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
