import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QrCodeService } from './qr-code.service';
import { GenerateQrCodeDto } from './dto/generate-qr-code.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminRole } from '../../common/enums';

@ApiTags('QR Code Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('qr-codes')
export class QrCodeController {
  constructor(private readonly qrCodeService: QrCodeService) {}

  @Post('generate')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Generate QR codes for a product (up to 20,000)' })
  @ApiResponse({ status: 201, description: 'QR codes generated and saved to database' })
  generate(@Body() generateQrCodeDto: GenerateQrCodeDto, @CurrentUser() admin: any) {
    return this.qrCodeService.generate(generateQrCodeDto, admin);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get QR code stats (total, active, used)' })
  @ApiResponse({ status: 200, description: 'QR stats' })
  getStats() {
    return this.qrCodeService.getStats();
  }

  @Get('hub')
  @ApiOperation({ summary: 'Get QR batches for QR Hub (paginated)' })
  @ApiResponse({ status: 200, description: 'List of QR batches' })
  findBatches(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.qrCodeService.findBatches(
      parseInt(page),
      parseInt(limit),
      search,
    );
  }

  @Post('download-history')
  @ApiOperation({ summary: 'Record QR download history for the logged-in admin/staff user' })
  @ApiResponse({ status: 201, description: 'QR download history recorded' })
  recordDownloadHistory(
    @CurrentUser() admin: any,
    @Body() body: {
      productId?: string;
      productName?: string;
      batchId?: string;
      batchNo?: number | string | null;
      quantity?: number;
      downloadType?: string;
    },
  ) {
    return this.qrCodeService.recordDownloadHistory(admin, body);
  }

  @Get('download-history')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.STAFF)
  @ApiOperation({ summary: 'Get QR download history for super admin' })
  @ApiResponse({ status: 200, description: 'QR download history list' })
  getDownloadHistory(
    @CurrentUser() admin: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.qrCodeService.getDownloadHistory(
      admin,
      parseInt(page),
      parseInt(limit),
      search,
      fromDate,
      toDate,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all QR codes (paginated)' })
  @ApiResponse({ status: 200, description: 'List of QR codes' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('productId') productId?: string,
    @Query('isScanned') isScanned?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('batchId') batchId?: string,
  ) {
    // Support both isScanned=true/false and status=active/used
    let scannedFilter: boolean | undefined;
    if (isScanned !== undefined) {
      scannedFilter = isScanned === 'true';
    } else if (status === 'used') {
      scannedFilter = true;
    } else if (status === 'active') {
      scannedFilter = false;
    }

    return this.qrCodeService.findAll(
      parseInt(page),
      parseInt(limit),
      productId,
      scannedFilter,
      search,
      batchId,
    );
  }

  // NOTE: This route MUST come before /:id to avoid "delete-all" being treated as an id
  @Delete('delete-all')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete all QR codes (optionally filter by productId)' })
  @ApiResponse({ status: 200, description: 'QR codes deleted' })
  removeAll(@Query('productId') productId?: string) {
    return this.qrCodeService.removeAll(productId);
  }

  @Patch('batches/:batchId')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update product or points for a QR batch' })
  @ApiResponse({ status: 200, description: 'QR batch updated' })
  updateBatch(
    @Param('batchId') batchId: string,
    @Body() body: { productId?: string; rewardPoints?: number },
  ) {
    return this.qrCodeService.updateBatch(batchId, body);
  }

  @Delete('batches/:batchId')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a full QR batch' })
  @ApiResponse({ status: 200, description: 'QR batch deleted' })
  removeBatch(@Param('batchId') batchId: string) {
    return this.qrCodeService.removeBatch(batchId);
  }

  @Get(':id/first-scan')
  @ApiOperation({ summary: 'Get first scanner details for a QR code' })
  @ApiResponse({ status: 200, description: 'First QR scan details' })
  findFirstScan(@Param('id') id: string) {
    return this.qrCodeService.findFirstScan(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get QR code by ID' })
  @ApiResponse({ status: 200, description: 'QR code details' })
  findOne(@Param('id') id: string) {
    return this.qrCodeService.findOne(id);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a single QR code by ID or code string' })
  @ApiResponse({ status: 200, description: 'QR code deleted successfully' })
  remove(@Param('id') id: string) {
    return this.qrCodeService.remove(id);
  }
}
