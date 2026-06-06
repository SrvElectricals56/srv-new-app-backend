import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductOrderController } from './product-order.controller';
import { ProductOrderService } from './product-order.service';
import { ProductOrder } from '../../database/entities/product-order.entity';
import { PointsConfig } from '../../database/entities/points-config.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Product } from '../../database/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrder, PointsConfig, Wallet, AppUser, CounterBoy, Product])],
  controllers: [ProductOrderController],
  providers: [ProductOrderService],
  exports: [ProductOrderService],
})
export class ProductOrderModule {}
