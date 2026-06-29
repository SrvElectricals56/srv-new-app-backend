import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OfferStatus } from '../../common/enums';
import { numericTransformer } from '../numeric.transformer';

@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  discount: string;

  @Column({ type: 'date' })
  validFrom: Date;

  @Column({ type: 'date' })
  validTo: Date;

  @Column({ nullable: true })
  targetRole: string;

  @Column({
    type: 'enum',
    enum: OfferStatus,
    default: OfferStatus.ACTIVE,
  })
  status: OfferStatus;

  @Column({ nullable: true })
  productCategory: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  bonusPoints: number;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  termsAndConditions: string;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ nullable: true })
  maxUsage: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
