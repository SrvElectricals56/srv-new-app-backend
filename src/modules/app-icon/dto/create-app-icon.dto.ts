import { IsString, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BUNDLED_APP_ICON_KEYS } from '../app-icon.constants';

export class CreateAppIconDto {
  @ApiProperty({ description: 'Icon name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Icon image URL', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Bundled launcher icon key', enum: BUNDLED_APP_ICON_KEYS, required: false })
  @IsOptional()
  @IsString()
  @IsIn(BUNDLED_APP_ICON_KEYS)
  nativeKey?: string;

  @ApiProperty({ description: 'Whether this icon is active', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Display order', required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}
