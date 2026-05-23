import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetActiveIconDto {
  @ApiProperty({ description: 'Icon ID to set as active' })
  @IsString()
  @IsNotEmpty()
  iconId: string;
}
