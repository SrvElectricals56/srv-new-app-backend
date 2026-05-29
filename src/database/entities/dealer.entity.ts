import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { MemberTier, UserStatus, KYCStatus } from '../../common/enums';
import { Electrician } from './electrician.entity';

@Entity('dealers')
export class Dealer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ unique: true })
  dealerCode: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column()
  town: string;

  @Column()
  district: string;

  @Column()
  state: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ nullable: true })
  pincode: string;

  @Column({ nullable: true })
  gstNumber: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  salesManName: string;

  @Column({ nullable: true })
  townCode: string;

  @Column({ nullable: true })
  rtoCode: string;

  @Column({ nullable: true })
  listCode: string;

  @Column({ type: 'text', nullable: true })
  electricianList: string;

  @Column({
    type: 'enum',
    enum: MemberTier,
    default: MemberTier.SILVER,
  })
  tier: MemberTier;

  @Column({ default: 0 })
  electricianCount: number;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING,
  })
  status: UserStatus;

  @Column({ nullable: true })
  rejectionReason: string;

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

  @Column({ default: 0 })
  totalOrders: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyTarget: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  achievedTarget: number;

  @Column({ default: 0 })
  walletBalance: number;

  @Column({ default: 'pending' })
  bonusStatus: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'bonuspoints' })
  bonusPoints: number;

  @OneToMany(() => Electrician, (electrician) => electrician.dealer)
  electricians: Electrician[];

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ nullable: true })
  lastActivityAt: Date;

  @CreateDateColumn()
  joinedDate: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
