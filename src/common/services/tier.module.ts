import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TierService } from './tier.service';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Settings } from '../../database/entities/settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Electrician, Dealer, Settings])],
  providers: [TierService],
  exports: [TierService],
})
export class TierModule {}
