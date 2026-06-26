import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { Admin } from './database/entities/admin.entity';
import { Banner } from './database/entities/banner.entity';
import { Dealer } from './database/entities/dealer.entity';
import { Electrician } from './database/entities/electrician.entity';
import { AppUser } from './database/entities/app-user.entity';
import { CounterBoy } from './database/entities/counterboy.entity';
import { Notification } from './database/entities/notification.entity';
import { Offer } from './database/entities/offer.entity';
import { PointsConfig } from './database/entities/points-config.entity';
import { Product } from './database/entities/product.entity';
import { ProductCartItem } from './database/entities/product-cart-item.entity';
import { ProductOrder } from './database/entities/product-order.entity';
import { QrCode } from './database/entities/qr-code.entity';
import { Redemption } from './database/entities/redemption.entity';
import { Scan } from './database/entities/scan.entity';
import { Settings } from './database/entities/settings.entity';
import { SupportTicket } from './database/entities/support-ticket.entity';
import { Testimonial } from './database/entities/testimonial.entity';
import { Wallet } from './database/entities/wallet.entity';
import { GiftOrder } from './database/entities/gift-order.entity';
import { ProductCategory } from './database/entities/product-category.entity';
import { Play } from './database/entities/play.entity';
import { AppIcon } from './database/entities/app-icon.entity';
import { AppActivityEvent } from './database/entities/app-activity-event.entity';
import { AdminPermission } from './database/entities/admin-permission.entity';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { ElectricianModule } from './modules/electrician/electrician.module';
import { DealerModule } from './modules/dealer/dealer.module';
import { ProductModule } from './modules/product/product.module';
import { QrCodeModule } from './modules/qr-code/qr-code.module';
import { ScanModule } from './modules/scan/scan.module';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { GiftModule } from './modules/gift/gift.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OfferModule } from './modules/offer/offer.module';
import { BannerModule } from './modules/banner/banner.module';
import { TestimonialModule } from './modules/testimonial/testimonial.module';
import { ReferralModule } from './modules/referral/referral.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SupportModule } from './modules/support/support.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MobileAuthModule } from './modules/mobile-auth/mobile-auth.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { UploadModule } from './modules/upload/upload.module';
import { ProductCategoryModule } from './modules/product-category/product-category.module';
import { AppUserModule } from './modules/app-user/app-user.module';
import { CounterBoyModule } from './modules/counterboy/counterboy.module';
import { PlayModule } from './modules/play/play.module';
import { AppIconModule } from './modules/app-icon/app-icon.module';
import { CartModule } from './modules/cart/cart.module';
import { ProductOrderModule } from './modules/product-order/product-order.module';
import { CrossRolePhoneModule } from './common/services/cross-role-phone.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: parseInt(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_DATABASE', 'srv_admin'),
        entities: [
          Admin, Banner, Dealer, Electrician, AppUser, CounterBoy,
          Notification, Offer, PointsConfig, Product, ProductCartItem, ProductOrder, QrCode, Redemption,
          Scan, Settings, SupportTicket, Testimonial, Wallet, GiftOrder, ProductCategory, Play, AppIcon, AppActivityEvent,
          AdminPermission,
        ],
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
        logging: configService.get<string>('DB_LOGGING') === 'true',
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: false,
        ssl: false,
        extra: { ssl: false },
      }),
      inject: [ConfigService],
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [{
        ttl: parseInt(configService.get('THROTTLE_TTL') || '60') * 1000,
        limit: parseInt(configService.get('THROTTLE_LIMIT') || '100'),
      }],
      inject: [ConfigService],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    CrossRolePhoneModule,

    // Feature Modules
    AuthModule,
    AdminModule,
    ElectricianModule,
    DealerModule,
    ProductModule,
    QrCodeModule,
    ScanModule,
    RedemptionModule,
    GiftModule,
    NotificationModule,
    OfferModule,
    BannerModule,
    TestimonialModule,
    ReferralModule,
    WalletModule,
    FinanceModule,
    AnalyticsModule,
    SupportModule,
    SettingsModule,
    MobileAuthModule,
    MobileModule,
    UploadModule,
    ProductCategoryModule,
    AppUserModule,
    CounterBoyModule,
    PlayModule,
    AppIconModule,
    CartModule,
    ProductOrderModule,
  ],
})
export class AppModule {}
