import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import {
  MemberTier,
  UserStatus,
  ElectricianSubCategory,
  KYCStatus,
} from '../../common/enums';
import { Dealer } from './dealer.entity';
import { numericTransformer } from '../numeric.transformer';

@Entity('electricians')
export class Electrician {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ unique: true })
  electricianCode: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column()
  city: string;

  @Column()
  state: string;

  @Column()
  district: string;

  @Column({ nullable: true })
  pincode: string;

  @Column({ nullable: true, type: 'text' })
  address: string;

  @Column({
    type: 'enum',
    enum: ElectricianSubCategory,
    default: ElectricianSubCategory.GENERAL_ELECTRICIAN,
  })
  subCategory: ElectricianSubCategory;

  @Column({
    type: 'enum',
    enum: MemberTier,
    default: MemberTier.SILVER,
  })
  tier: MemberTier;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericTransformer })
  totalPoints: number;

  @Column({ default: 0 })
  totalScans: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericTransformer })
  walletBalance: number;

  @Column({ default: 0 })
  totalRedemptions: number;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ default: false })
  bankLinked: boolean;

  @Column({ nullable: true })
  upiId: string;

  @Column({ nullable: true })
  bankAccount: string;

  @Column({ nullable: true })
  ifsc: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  accountHolderName: string;

  @Column({
    type: 'enum',
    enum: KYCStatus,
    default: KYCStatus.NOT_SUBMITTED,
  })
  kycStatus: KYCStatus;

  @Column({ nullable: true })
  aadharNumber: string;

  @Column({ nullable: true })
  panNumber: string;

  @Column({ nullable: true })
  aadharFrontImage: string;

  @Column({ nullable: true })
  panDocument: string;

  @Column({ nullable: true })
  gstDocument: string;

  @Column({ nullable: true })
  kycRejectionReason: string;

  @Column({ type: 'uuid', nullable: true })
  dealerId: string;

  @Column({ nullable: true })
  fallbackDealerName: string;

  @Column({ nullable: true })
  fallbackDealerPhone: string;

  @Column({ nullable: true })
  fallbackDealerCode: string;

  @ManyToOne(() => Dealer, (dealer) => dealer.electricians, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'dealerId' })
  dealer: Dealer;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ default: 0 })
  tokenVersion: number;

  @Column({ nullable: true })
  lastActivityAt: Date;

  @Column({ default: false })
  appInstalled: boolean;

  @Column({ nullable: true, type: 'timestamptz' })
  firstAppLoginAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedDate: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
