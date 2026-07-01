import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { PointsConfigDto } from './dto/points-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';

@ApiTags('Settings Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings' })
  @ApiResponse({ status: 200, description: 'List of settings' })
  findAll() {
    return this.settingsService.findAll();
  }

  @Get('rate-us/history')
  @ApiOperation({ summary: 'Get app rating history submitted by mobile users' })
  @ApiResponse({ status: 200, description: 'List of app ratings with user details' })
  getRatingHistory() {
    return this.settingsService.getRatingHistory();
  }

  @Get('global-search')
  @ApiOperation({ summary: 'Search users, catalog, QR codes and orders from the admin panel' })
  globalSearch(@Query('q') query: string, @Query('limit') limit?: string) {
    return this.settingsService.globalSearch(query, Number(limit));
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get setting by key' })
  @ApiResponse({ status: 200, description: 'Setting value' })
  findOne(@Param('key') key: string) {
    return this.settingsService.findOne(key);
  }

  @Put(':key')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update setting' })
  @ApiResponse({ status: 200, description: 'Setting updated successfully' })
  update(
    @Param('key') key: string,
    @Body() updateSettingDto: UpdateSettingDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.settingsService.update(key, updateSettingDto, adminId);
  }

  @Post('points-config')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Configure points for products' })
  @ApiResponse({ status: 201, description: 'Points configuration updated' })
  configurePoints(
    @Body() pointsConfigDto: PointsConfigDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.settingsService.configurePoints(pointsConfigDto, adminId);
  }
}
