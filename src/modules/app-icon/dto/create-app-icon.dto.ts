import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppIconDto {
  @ApiProperty({ description: 'Icon name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Icon image URL', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Whether this icon is active', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Display order', required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}
