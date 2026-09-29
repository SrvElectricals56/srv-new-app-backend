import { IsString, Matches } from 'class-validator';

export class TransferSubDealerDto {
  @IsString()
  @Matches(/^(?:\+91[ -]?|91[ -]?|0)?[6-9][0-9]{9}$/, {
    message: 'Enter a valid 10-digit dealer mobile number (optional +91 prefix)',
  })
  phone: string;

  @IsString()
  targetId: string;
}
