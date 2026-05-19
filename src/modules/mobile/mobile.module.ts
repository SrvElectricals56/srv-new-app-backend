import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';
import { Product } from '../../database/entities/product.entity';
import { Banner } from '../../database/entities/banner.entity';
import { Notification } from '../../database/entities/notification.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Testimonial } from '../../database/entities/testimonial.entity';
import { QrCode } from '../../database/entities/qr-code.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Settings } from '../../database/entities/settings.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { GiftOrder } from '../../database/entities/gift-order.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { TierModule } from '../../common/services/tier.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product, Banner, Notification, Offer, Testimonial,
      QrCode, Scan, Wallet, Electrician, Dealer, AppUser, CounterBoy, Redemption,
      Settings, SupportTicket, GiftOrder, ProductCategory,
    ]),
    MobileAuthModule,
    TierModule,
  ],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}
