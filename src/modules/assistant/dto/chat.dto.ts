import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(1200)
  content: string;
}

export class ChatDto {
  @IsString()
  @MaxLength(1200)
  message: string;

  @IsOptional()
  @IsIn(['English', 'Hindi', 'Punjabi'])
  language?: 'English' | 'Hindi' | 'Punjabi';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

export class SpeechDto {
  @IsString()
  @MaxLength(1200)
  text: string;

  @IsOptional()
  @IsIn(['English', 'Hindi', 'Punjabi'])
  language?: 'English' | 'Hindi' | 'Punjabi';
}
