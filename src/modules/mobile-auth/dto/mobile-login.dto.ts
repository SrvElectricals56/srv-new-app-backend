import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export type MobileUserRole = 'electrician' | 'dealer' | 'user' | 'counterboy';

export class MobileLoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'phone must contain exactly 10 digits' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['electrician', 'dealer', 'user', 'counterboy'])
  role: MobileUserRole;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'phone must contain exactly 10 digits' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['electrician', 'dealer', 'user', 'counterboy'])
  role: MobileUserRole;

  @IsString()
  @IsNotEmpty()
  @Length(4, 6)
  otp: string;
}

export class PasswordLoginDto extends MobileLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class SendSignupOtpDto extends MobileLoginDto {}

export class VerifySignupOtpDto extends SendSignupOtpDto {
  @IsString()
  @Length(4, 6)
  otp: string;
}

export class ResetPasswordDto extends VerifyOtpDto {
  @IsString()
  @MinLength(8)
  @MaxLength(8)
  @Matches(/^(?=.*[^A-Za-z0-9])\S{8}$/, {
    message: 'Password must be exactly 8 characters long and include one special character',
  })
  newPassword: string;
}

class BaseRegistrationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must contain exactly 10 digits' })
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;
}

export class RegisterDealerDto extends BaseRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  town: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  district: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  state: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gstNumber?: string;
}

export class RegisterElectricianDto extends BaseRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  district: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  state: string;

  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'dealerPhone must contain exactly 10 digits',
  })
  dealerPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  subCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  electricianCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dealerCode?: string;

  @IsOptional()
  @IsIn(['Silver', 'Gold', 'Platinum', 'Diamond'])
  tier?: 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

  @IsOptional()
  @IsIn(['active', 'pending', 'inactive', 'suspended'])
  status?: 'active' | 'pending' | 'inactive' | 'suspended';
}

export class MobileRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'phone must contain exactly 10 digits' })
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  password?: string;
}

export class RegisterCounterBoyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'phone must contain exactly 10 digits' })
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  password?: string;
}
