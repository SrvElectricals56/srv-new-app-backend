import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  UseGuards,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RedemptionService } from './redemption.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RedemptionStatus, UserRole } from '../../common/enums';

@ApiTags('Redemption Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('redemptions')
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  @Get()
  @ApiOperation({ summary: 'Get all redemptions' })
  @ApiResponse({ status: 200, description: 'List of redemptions' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: RedemptionStatus,
    @Query('role') role?: UserRole,
    @Query('userId') userId?: string,
  ) {
    return this.redemptionService.findAll(parseInt(page), parseInt(limit), status, role, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get redemption by ID' })
  @ApiResponse({ status: 200, description: 'Redemption details' })
  findOne(@Param('id') id: string) {
    return this.redemptionService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update redemption status' })
  @ApiResponse({ status: 200, description: 'Redemption status updated successfully' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: RedemptionStatus,
    @Body('rejectionReason') rejectionReason: string | undefined,
    @CurrentUser('id') adminId: string,
  ) {
    return this.redemptionService.updateStatus(id, status, adminId, rejectionReason);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve redemption' })
  @ApiResponse({ status: 200, description: 'Redemption approved successfully' })
  approve(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.redemptionService.approve(id, adminId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject redemption' })
  @ApiResponse({ status: 200, description: 'Redemption rejected successfully' })
  reject(
    @Param('id') id: string,
    @Body('rejectionReason') rejectionReason: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.redemptionService.reject(id, rejectionReason || 'Rejected by admin', adminId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete redemption record' })
  @ApiResponse({ status: 200, description: 'Redemption deleted successfully' })
  remove(@Param('id') id: string) {
    return this.redemptionService.remove(id);
  }
}
