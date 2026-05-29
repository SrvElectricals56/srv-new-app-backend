import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DealerService } from './dealer.service';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserStatus, MemberTier, AdminRole } from '../../common/enums';

@ApiTags('Dealer Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dealers')
export class DealerController {
  constructor(private readonly dealerService: DealerService) {}

  @Post()
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new dealer' })
  @ApiResponse({ status: 201, description: 'Dealer created successfully' })
  create(@Body() createDealerDto: CreateDealerDto) {
    return this.dealerService.create(createDealerDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all dealers' })
  @ApiResponse({ status: 200, description: 'List of dealers' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('tier') tier?: MemberTier,
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('bankLinked') bankLinked?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dealerService.findAll(
      parseInt(page), parseInt(limit),
      search, status, tier, state, city,
      bankLinked === 'true' ? true : bankLinked === 'false' ? false : undefined,
      dateFrom, dateTo,
    );
  }

  @Post('import')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Bulk import dealers (upsert by phone)' })
  importMany(@Body('records') records: any[]) {
    return this.dealerService.importMany(records);
  }

  @Get('distinct-states')
  @ApiOperation({ summary: 'Get all distinct dealer states for filter dropdown' })
  getDistinctStates() {
    return this.dealerService.getDistinctStates();
  }

  @Get('distinct-cities')
  @ApiOperation({ summary: 'Get all distinct dealer cities for filter dropdown' })
  getDistinctCities(@Query('state') state?: string) {
    return this.dealerService.getDistinctCities(state);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dealer stats (total, active, pending counts)' })
  @ApiResponse({ status: 200, description: 'Dealer stats' })
  getStats() {
    return this.dealerService.getStats();
  }

  @Get('top')
  @ApiOperation({ summary: 'Get top dealers by electricians added within a date range' })
  getTop(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit = '10',
  ) {
    return this.dealerService.getTop(from, to, parseInt(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dealer by ID' })
  @ApiResponse({ status: 200, description: 'Dealer details' })
  findOne(@Param('id') id: string) {
    return this.dealerService.findOne(id);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update dealer' })
  @ApiResponse({ status: 200, description: 'Dealer updated successfully' })
  update(@Param('id') id: string, @Body() updateDealerDto: UpdateDealerDto) {
    return this.dealerService.update(id, updateDealerDto);
  }

  @Patch(':id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update dealer status' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
    @Body('rejectionReason') rejectionReason?: string,
  ) {
    return this.dealerService.updateStatus(id, status, rejectionReason);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete dealer' })
  @ApiResponse({ status: 200, description: 'Dealer deleted successfully' })
  remove(@Param('id') id: string) {
    return this.dealerService.remove(id);
  }

  @Get(':id/electricians')
  @ApiOperation({ summary: 'Get dealer electricians' })
  @ApiResponse({ status: 200, description: 'Dealer electricians' })
  getElectricians(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.dealerService.getDealerElectricians(id, parseInt(page), parseInt(limit));
  }

  @Get(':id/wallet')
  @ApiOperation({ summary: 'Get dealer wallet transactions' })
  @ApiResponse({ status: 200, description: 'Wallet transactions' })
  getWallet(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.dealerService.getDealerWallet(id, parseInt(page), parseInt(limit));
  }
}
