import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateProductCategoryDto } from './create-product-category.dto';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateProductCategoryDto extends PartialType(CreateProductCategoryDto) {
  @ApiPropertyOptional({ description: 'Displayed product count override' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productCount?: number;
}
