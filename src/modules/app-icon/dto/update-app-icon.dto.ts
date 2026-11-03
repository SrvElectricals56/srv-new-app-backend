import { IsString, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BUNDLED_APP_ICON_KEYS } from '../app-icon.constants';

export class UpdateAppIconDto {
  @ApiProperty({ description: 'Icon name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Icon image URL', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Bundled launcher icon key', enum: BUNDLED_APP_ICON_KEYS, required: false })
  @IsOptional()
  @IsString()
  @IsIn(BUNDLED_APP_ICON_KEYS)
  nativeKey?: string;

  @ApiProperty({ description: 'Whether this icon is active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Display order', required: false })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}
