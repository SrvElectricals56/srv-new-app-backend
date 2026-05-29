import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { TransferPointsDto } from './dto/transfer-points.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TransactionType, UserRole, AdminRole } from '../../common/enums';

@ApiTags('Finance Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary' })
  @ApiResponse({ status: 200, description: 'Financial summary' })
  getSummary() {
    return this.financeService.getSummary();
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get all financial transactions' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  getTransactions(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('type') type?: TransactionType,
    @Query('userRole') userRole?: UserRole,
  ) {
    return this.financeService.getTransactions(parseInt(page), parseInt(limit), type, userRole);
  }

  @Get('dealer-bonus')
  @ApiOperation({ summary: 'Get dealer bonus summary' })
  @ApiResponse({ status: 200, description: 'Dealer bonus summary' })
  getDealerBonus() {
    return this.financeService.getDealerBonus();
  }

  @Post('dealer-bonus/transfer')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Transfer dealer bonus' })
  @ApiResponse({ status: 201, description: 'Bonus transferred successfully' })
  transferDealerBonus(
    @Body() transferData: { dealerId: string; amount: number; description?: string },
    @CurrentUser('id') adminId: string,
  ) {
    return this.financeService.transferDealerBonus(transferData, adminId);
  }

  @Get('transfer-points')
  @ApiOperation({ summary: 'Get points transfer history' })
  @ApiResponse({ status: 200, description: 'Points transfer history' })
  getTransferPoints() {
    return this.financeService.getTransferPoints();
  }

  @Post('transfer-points')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Manually transfer points between users' })
  @ApiResponse({ status: 201, description: 'Points transferred successfully' })
  transferPoints(
    @Body() body: { fromUser: string; toUser: string; points: number; reason?: string },
    @CurrentUser('id') adminId: string,
  ) {
    return this.financeService.manualTransferPoints(body, adminId);
  }

  @Patch('transfer-points/:id/reverse')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reverse a points transfer' })
  @ApiResponse({ status: 200, description: 'Transfer reversed successfully' })
  reverseTransfer(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.financeService.reverseTransfer(id, adminId);
  }

  @Delete('transfer-points/:id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a points transfer record' })
  @ApiResponse({ status: 200, description: 'Transfer deleted successfully' })
  deleteTransfer(@Param('id') id: string) {
    return this.financeService.deleteTransfer(id);
  }

  @Patch('dealer-bonus/:dealerId/mark-paid')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Mark dealer bonus as paid' })
  @ApiResponse({ status: 200, description: 'Dealer bonus marked as paid' })
  markDealerBonusPaid(
    @Param('dealerId') dealerId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.financeService.markDealerBonusPaid(dealerId, adminId);
  }

  @Patch('dealer-bonus/:dealerId')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update dealer bonus record' })
  @ApiResponse({ status: 200, description: 'Dealer bonus updated successfully' })
  updateDealerBonus(
    @Param('dealerId') dealerId: string,
    @Body() body: { bonusPoints?: number; electricianCount?: number; bonusStatus?: string },
  ) {
    return this.financeService.updateDealerBonus(dealerId, body);
  }

  @Post('dealer-bonus/bulk-mark-paid')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Bulk mark dealer bonuses as paid' })
  @ApiResponse({ status: 200, description: 'Dealer bonuses marked as paid' })
  bulkMarkDealerBonusPaid(
    @Body() body: { dealerIds: string[] },
    @CurrentUser('id') adminId: string,
  ) {
    return this.financeService.bulkMarkDealerBonusPaid(body.dealerIds, adminId);
  }
}
