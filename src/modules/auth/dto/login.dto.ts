import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@srvelectricals.com',
    description: 'Admin email address or username',
    required: false,
  })
  @ValidateIf((object) => !object.email)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  identifier?: string;

  @ApiProperty({
    example: 'admin@srvelectricals.com',
    description: 'Legacy admin email field accepted for backward compatibility',
    required: false,
  })
  @ValidateIf((object) => !object.identifier)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: 'Admin@123',
    description: 'Admin password',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
