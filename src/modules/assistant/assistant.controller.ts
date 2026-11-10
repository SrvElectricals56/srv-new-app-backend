import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssistantService } from './assistant.service';
import { ChatDto, SpeechDto } from './dto/chat.dto';

@ApiTags('SRV Chat')
@Controller('mobile/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: 'Chat with SRV product and app support assistant' })
  chat(@Body() body: ChatDto) {
    return this.assistant.chat(body);
  }

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Transcribe a short SRV Chat voice message' })
  transcribe(@UploadedFile() file?: Express.Multer.File) {
    return this.assistant.transcribe(file);
  }

  @Post('speech')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'Speak an SRV Chat reply with an AI voice' })
  speech(@Body() body: SpeechDto) {
    return this.assistant.speech(body);
  }
}
