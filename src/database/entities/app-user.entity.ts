import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MemberTier, UserStatus, KYCStatus } from '../../common/enums';

/**
 * AppUser — Customer / end-user role in the mobile app
 */
@Entity('app_users')
export class AppUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ unique: true })
  userCode: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  pincode: string;

  @Column({ nullable: true, type: 'text' })
  address: string;

  @Column({
    type: 'enum',
    enum: MemberTier,
    default: MemberTier.SILVER,
  })
  tier: MemberTier;

  @Column({ default: 0 })
  totalPoints: number;

  @Column({ default: 0 })
  walletBalance: number;

  @Column({ default: 0 })
  totalRedemptions: number;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING,
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
  aadharDocument: string;

  @Column({ nullable: true })
  panDocument: string;

  @Column({ nullable: true })
  kycRejectionReason: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ nullable: true })
  language: string;

  @Column({ default: false })
  darkMode: boolean;

  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ nullable: true })
  lastActivityAt: Date;

  @CreateDateColumn()
  joinedDate: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
