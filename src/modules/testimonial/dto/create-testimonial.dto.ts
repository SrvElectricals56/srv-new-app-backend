import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTestimonialDto {
  @ApiProperty()
  @IsString()
  personName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  initials?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  yearsConnected?: number;

  @ApiProperty()
  @IsString()
  quote: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  highlight?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  gradientColors?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ringColor?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiProperty({ required: false, description: 'all | electrician | dealer | customer | counterboy', default: 'all' })
  @IsOptional()
  @IsString()
  userCategory?: string;

  // Legacy fields
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ minimum: 1, maximum: 5, default: 5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
