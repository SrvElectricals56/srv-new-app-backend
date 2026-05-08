import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { CounterBoyController } from './counterboy.controller';
import { CounterBoyService } from './counterboy.service';

@Module({
  imports: [TypeOrmModule.forFeature([CounterBoy, Dealer])],
  controllers: [CounterBoyController],
  providers: [CounterBoyService],
  exports: [CounterBoyService],
})
export class CounterBoyModule {}
