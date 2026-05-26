import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateQrCodeDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1, maximum: 20000 })
  @IsNumber()
  @Min(1)
  @Max(20000)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({
    description:
      'Optional reward points to freeze on the generated QRs. Defaults to the current product points.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardPoints?: number;
}
