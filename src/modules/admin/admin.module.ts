import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Admin } from '../../database/entities/admin.entity';
import { AdminPermission } from '../../database/entities/admin-permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin, AdminPermission])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
