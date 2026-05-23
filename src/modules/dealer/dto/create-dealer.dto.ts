import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MemberTier, UserStatus, KYCStatus } from '../../../common/enums';

export class CreateDealerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty()
  @IsString()
  dealerCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty()
  @IsString()
  town: string;

  @ApiProperty()
  @IsString()
  district: string;

  @ApiProperty()
  @IsString()
  state: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiProperty({ enum: MemberTier, default: 'Silver' })
  @IsOptional()
  @IsEnum(MemberTier)
  tier?: MemberTier;

  @ApiProperty({ enum: UserStatus, default: 'pending' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

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

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  monthlyTarget?: number;

  @ApiProperty({ enum: KYCStatus, required: false })
  @IsOptional()
  @IsEnum(KYCStatus)
  kycStatus?: KYCStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  salesManName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  townCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rtoCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  listCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  electricianList?: string;

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