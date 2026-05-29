import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrCodeController } from './qr-code.controller';
import { QrCodeService } from './qr-code.service';
import { QrCode } from '../../database/entities/qr-code.entity';
import { Product } from '../../database/entities/product.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QrCode, Product, Electrician, Dealer, AppUser, CounterBoy])],
  controllers: [QrCodeController],
  providers: [QrCodeService],
  exports: [QrCodeService],
})
export class QrCodeModule {}