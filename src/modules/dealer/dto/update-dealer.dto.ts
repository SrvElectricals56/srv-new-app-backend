import { PartialType, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateDealerDto } from './create-dealer.dto';

export class UpdateDealerDto extends PartialType(CreateDealerDto) {
  @ApiProperty({ required: false, description: 'Set or reset the dealer app login password' })
  @IsOptional()
  @IsString()
  password?: string;
}
