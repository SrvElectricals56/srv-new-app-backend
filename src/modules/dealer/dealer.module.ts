import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DealerController } from './dealer.controller';
import { DealerService } from './dealer.service';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { Scan } from '../../database/entities/scan.entity';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder } from '../../database/entities/product-order.entity';
import { AppActivityEvent } from '../../database/entities/app-activity-event.entity';
import { TierModule } from '../../common/services/tier.module';
import { CrossRolePhoneModule } from '../../common/services/cross-role-phone.module';

@Module({
  imports: [TypeOrmModule.forFeature([Dealer, Electrician, Wallet, Scan, ProductCartItem, ProductOrder, AppActivityEvent]), TierModule, CrossRolePhoneModule],
  controllers: [DealerController],
  providers: [DealerService],
  exports: [DealerService],
})
export class DealerModule {}
