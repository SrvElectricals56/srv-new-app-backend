import {
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly tierService: TierService,
  ) {}

  @Get('dashboard')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get dashboard analytics' })
  getDashboard() {
    return this.analyticsService.getDashboard();
  }

  @Get('scans')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get scan analytics' })
  getScans() {
    return this.analyticsService.getScans();
  }

  @Get('users')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get user analytics' })
  getUsers() {
    return this.analyticsService.getUsers();
  }

  @Get('revenue')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get revenue analytics' })
  getRevenue() {
    return this.analyticsService.getRevenue();
  }

  @Post('sync-tiers')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Force sync all electrician & dealer tiers from DB' })
  @ApiResponse({ status: 200, description: 'All tiers synced successfully' })
  async syncAllTiers() {
    await Promise.all([
      this.tierService.syncAllElectricianTiers(),
      this.tierService.syncAllDealerTiers(),
    ]);
    return { message: 'All tiers synced successfully', syncedAt: new Date() };
  }
}
