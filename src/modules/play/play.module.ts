import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayController, MobilePlayController } from './play.controller';
import { PlayService } from './play.service';
import { Play } from '../../database/entities/play.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Play])],
  controllers: [PlayController, MobilePlayController],
  providers: [PlayService],
  exports: [PlayService],
})
export class PlayModule {}
