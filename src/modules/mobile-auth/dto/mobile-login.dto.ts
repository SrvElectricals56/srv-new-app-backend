import { IsString, IsNotEmpty, Length, IsIn, IsOptional } from 'class-validator';

export type MobileUserRole = 'electrician' | 'dealer' | 'user' | 'counterboy';

export class MobileLoginDto {
  @IsString()
  @IsNotEmpty()
  @Length(10, 10)
  phone: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['electrician', 'dealer', 'user', 'counterboy'])
  role: MobileUserRole;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['electrician', 'dealer', 'user', 'counterboy'])
  role: MobileUserRole;

  @IsString()
  @IsNotEmpty()
  otp: string;
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
  @Length(10, 10)
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
  @Length(10, 10)
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

  /** Phone of the dealer this counterboy is linked to */
  @IsString()
  @IsOptional()
  dealerPhone?: string;

  @IsString()
  @IsOptional()
  password?: string;
}
