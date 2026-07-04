import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder } from '../../database/entities/product-order.entity';
import { Product } from '../../database/entities/product.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { Settings } from '../../database/entities/settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductCartItem,
      ProductOrder,
      Product,
      Electrician,
      Dealer,
      AppUser,
      CounterBoy,
      Settings,
      Wallet,
    ]),
    MobileAuthModule, // needed for MobileJwtGuard
  ],
  controllers: [CartController, RazorpayWebhookController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
