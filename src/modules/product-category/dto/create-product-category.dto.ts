import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductCategoryDto {
  @ApiProperty({ description: 'Category label/name' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ description: 'Category icon/glyph' })
  @IsOptional()
  @IsString()
  glyph?: string;

  @ApiPropertyOptional({ description: 'Category image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Sort order', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Displayed product count override' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productCount?: number;

  @ApiPropertyOptional({ description: 'Is category active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
