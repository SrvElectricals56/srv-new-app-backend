import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectricianController } from './electrician.controller';
import { ElectricianService } from './electrician.service';
import { Electrician } from '../../database/entities/electrician.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder } from '../../database/entities/product-order.entity';
import { AppActivityEvent } from '../../database/entities/app-activity-event.entity';
import { TierModule } from '../../common/services/tier.module';
import { CrossRolePhoneModule } from '../../common/services/cross-role-phone.module';

@Module({
  imports: [TypeOrmModule.forFeature([Electrician, Scan, Wallet, Dealer, ProductCartItem, ProductOrder, AppActivityEvent]), TierModule, CrossRolePhoneModule],
  controllers: [ElectricianController],
  providers: [ElectricianService],
  exports: [ElectricianService],
})
export class ElectricianModule {}
