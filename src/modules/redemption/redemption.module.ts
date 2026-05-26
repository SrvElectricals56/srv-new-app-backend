import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Wallet } from '../../database/entities/wallet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Redemption, Electrician, Dealer, AppUser, CounterBoy, Wallet])],
  controllers: [RedemptionController],
  providers: [RedemptionService],
  exports: [RedemptionService],
})
export class RedemptionModule {}
