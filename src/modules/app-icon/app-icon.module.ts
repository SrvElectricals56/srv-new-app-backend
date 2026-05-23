import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppIconController } from './app-icon.controller';
import { AppIconService } from './app-icon.service';
import { AppIcon } from '../../database/entities/app-icon.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppIcon]), ConfigModule],
  controllers: [AppIconController],
  providers: [AppIconService],
  exports: [AppIconService],
})
export class AppIconModule {}
