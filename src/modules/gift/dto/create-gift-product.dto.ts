import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGiftProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sub?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  image?: string;

  // Frontend sends pointsRequired
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  pointsRequired?: number;

  // Legacy: points
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  points?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  badge?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  mrp?: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  stock?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  weight?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Frontend sends status: 'active' | 'inactive'
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  // Frontend sends type: 'electrician' | 'dealer' | 'customer' | 'counterboy'
  @ApiProperty({ required: false, description: 'electrician | dealer | customer | counterboy' })
  @IsOptional()
  @IsString()
  type?: string;
}
