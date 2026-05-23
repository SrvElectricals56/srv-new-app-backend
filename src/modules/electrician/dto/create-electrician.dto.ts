import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MemberTier, UserStatus, ElectricianSubCategory, KYCStatus } from '../../../common/enums';

export class CreateElectricianDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty()
  @IsString()
  electricianCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty()
  @IsString()
  state: string;

  @ApiProperty()
  @IsString()
  district: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiProperty({ enum: ElectricianSubCategory, required: false })
  @IsOptional()
  @IsEnum(ElectricianSubCategory)
  subCategory?: ElectricianSubCategory;

  @ApiProperty({ enum: MemberTier, default: 'Silver' })
  @IsOptional()
  @IsEnum(MemberTier)
  tier?: MemberTier;

  @ApiProperty({ enum: UserStatus, default: 'pending' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dealerId?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  bankLinked?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  upiId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ifsc?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiProperty({ enum: KYCStatus, required: false })
  @IsOptional()
  @IsEnum(KYCStatus)
  kycStatus?: KYCStatus;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  totalPoints?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  walletBalance?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  totalScans?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  aadharFrontImage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  aadharNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  panDocument?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gstDocument?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  kycRejectionReason?: string;
}