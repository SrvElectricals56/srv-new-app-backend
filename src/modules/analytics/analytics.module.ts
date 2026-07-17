import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { TierModule } from '../../common/services/tier.module';

@Module({
  imports: [TypeOrmModule.forFeature([Electrician, Dealer, Scan, Redemption, Wallet, AppUser, CounterBoy, SupportTicket]), TierModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
