import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ConfigModule } from '@nestjs/config';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';

@Module({
  imports: [ConfigModule, MobileAuthModule],
  controllers: [UploadController],
})
export class UploadModule {}
