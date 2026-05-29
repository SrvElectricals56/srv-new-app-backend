import { PartialType, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateElectricianDto } from './create-electrician.dto';

export class UpdateElectricianDto extends PartialType(CreateElectricianDto) {
  @ApiProperty({ required: false, description: 'Set or reset the electrician app login password' })
  @IsOptional()
  @IsString()
  password?: string;
}
