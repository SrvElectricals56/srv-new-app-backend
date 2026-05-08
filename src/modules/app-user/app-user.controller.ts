import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AppUserService } from './app-user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole, UserStatus } from '../../common/enums';

@ApiTags('App Users (Customers)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('app-users')
export class AppUserController {
  constructor(private readonly appUserService: AppUserService) {}

  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create app user' })
  create(@Body() body: any) {
    return this.appUserService.create(body);
  }

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get all app users (customers)' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.appUserService.findAll(+page, +limit, search, status);
  }

  @Get('stats')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get app user stats' })
  getStats() {
    return this.appUserService.getStats();
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get single app user' })
  findOne(@Param('id') id: string) {
    return this.appUserService.findOne(id);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update app user' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.appUserService.update(id, body);
  }

  @Patch(':id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update app user status' })
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.appUserService.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete app user (Super Admin only)' })
  remove(@Param('id') id: string) {
    return this.appUserService.remove(id);
  }
}
