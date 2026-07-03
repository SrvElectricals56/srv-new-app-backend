import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { CrossRolePhoneService } from './cross-role-phone.service';

@Module({
  imports: [TypeOrmModule.forFeature([Dealer, Electrician, AppUser, CounterBoy])],
  providers: [CrossRolePhoneService],
  exports: [CrossRolePhoneService],
})
export class CrossRolePhoneModule {}
