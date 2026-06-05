import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftController } from './gift.controller';
import { GiftService } from './gift.service';
import { Product } from '../../database/entities/product.entity';
import { GiftOrder } from '../../database/entities/gift-order.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { RedemptionModule } from '../redemption/redemption.module';
import { Wallet } from '../../database/entities/wallet.entity';
import { Dealer } from '../../database/entities/dealer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, GiftOrder, Redemption, Wallet, Dealer]),
    RedemptionModule,
  ],
  controllers: [GiftController],
  providers: [GiftService],
  exports: [GiftService],
})
export class GiftModule {}
