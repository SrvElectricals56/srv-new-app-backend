import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProductOrderService } from './product-order.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';

@ApiTags('Product Orders')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('product-orders')
export class ProductOrderController {
  constructor(private readonly productOrderService: ProductOrderService) {}

  @Get()
  @ApiOperation({ summary: 'Get all product orders' })
  @ApiResponse({ status: 200, description: 'List of product orders' })
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.productOrderService.findAll(parseInt(page), parseInt(limit), status, role, search);
  }

  @Get('stats/summary')
  @ApiOperation({ summary: 'Get product order stats' })
  @ApiResponse({ status: 200, description: 'Order statistics' })
  getStats() {
    return this.productOrderService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product order by ID' })
  @ApiResponse({ status: 200, description: 'Product order details' })
  findOne(@Param('id') id: string) {
    return this.productOrderService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update product order status' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; rejectionReason?: string; trackingNumber?: string; courierName?: string },
  ) {
    return this.productOrderService.updateStatus(id, body.status, {
      rejectionReason: body.rejectionReason,
      trackingNumber: body.trackingNumber,
      courierName: body.courierName,
    });
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Delete product order' })
  @ApiResponse({ status: 200, description: 'Product order deleted' })
  remove(@Param('id') id: string) {
    return this.productOrderService.remove(id);
  }
}
