import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductOrderController } from './product-order.controller';
import { ProductOrderService } from './product-order.service';
import { ProductOrder } from '../../database/entities/product-order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrder])],
  controllers: [ProductOrderController],
  providers: [ProductOrderService],
  exports: [ProductOrderService],
})
export class ProductOrderModule {}
