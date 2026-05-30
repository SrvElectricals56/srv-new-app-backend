import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppUser } from '../../database/entities/app-user.entity';
import { AppUserController } from './app-user.controller';
import { AppUserService } from './app-user.service';
import { CrossRolePhoneModule } from '../../common/services/cross-role-phone.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppUser]), CrossRolePhoneModule],
  controllers: [AppUserController],
  providers: [AppUserService],
  exports: [AppUserService],
})
export class AppUserModule {}
