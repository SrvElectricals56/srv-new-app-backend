import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Referral Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get()
  @ApiOperation({ summary: 'Get all referral records (electricians, dealers, customers, counterboys)' })
  @ApiResponse({ status: 200, description: 'List of referrals' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.referralService.findAll(parseInt(page), parseInt(limit), search, status, type);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get referral statistics' })
  @ApiResponse({ status: 200, description: 'Referral statistics' })
  getStats() {
    return this.referralService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get referral record by ID' })
  @ApiResponse({ status: 200, description: 'Referral record details' })
  findOne(@Param('id') id: string) {
    return this.referralService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update referral record (status, phone, tier)' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.referralService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete referral record' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  remove(@Param('id') id: string) {
    return this.referralService.remove(id);
  }
}
