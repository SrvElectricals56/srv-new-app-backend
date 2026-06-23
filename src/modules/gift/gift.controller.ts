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
import { GiftService } from './gift.service';
import { CreateGiftProductDto } from './dto/create-gift-product.dto';
import { UpdateGiftProductDto } from './dto/update-gift-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums';

@ApiTags('Gift Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gifts')
export class GiftController {
  constructor(private readonly giftService: GiftService) {}

  // ─── Gift Products ────────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'Get all gift products' })
  @ApiResponse({ status: 200, description: 'List of gift products' })
  getProducts(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('type') type?: string,
  ) {
    return this.giftService.getProducts(parseInt(page), parseInt(limit), type);
  }

  @Post('products')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new gift product' })
  @ApiResponse({ status: 201, description: 'Gift product created successfully' })
  createProduct(@Body() createGiftProductDto: CreateGiftProductDto) {
    return this.giftService.createProduct(createGiftProductDto);
  }

  @Patch('products/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update gift product' })
  @ApiResponse({ status: 200, description: 'Gift product updated successfully' })
  updateProduct(
    @Param('id') id: string,
    @Body() updateGiftProductDto: UpdateGiftProductDto,
  ) {
    return this.giftService.updateProduct(id, updateGiftProductDto);
  }

  @Delete('products/:id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete gift product' })
  @ApiResponse({ status: 200, description: 'Gift product deleted successfully' })
  deleteProduct(@Param('id') id: string) {
    return this.giftService.deleteProduct(id);
  }

  // ─── Gift Orders ──────────────────────────────────────────────────────────

  @Get('orders')
  @ApiOperation({ summary: 'Get all gift orders' })
  @ApiResponse({ status: 200, description: 'List of gift orders' })
  getOrders(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('role') role?: string,
  ) {
    return this.giftService.getOrders(parseInt(page), parseInt(limit), status, role);
  }

  @Post('orders')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new gift order' })
  @ApiResponse({ status: 201, description: 'Gift order created successfully' })
  createOrder(@Body() body: {
    userId: string;
    userName: string;
    userCode?: string;
    dealerName?: string;
    role: string;
    giftProductId: string;
    shippingAddress?: string;
  }) {
    return this.giftService.createOrder(body);
  }

  @Patch('orders/:id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update gift order status' })
  @ApiResponse({ status: 200, description: 'Order status updated successfully' })
  updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: string; rejectionReason?: string; trackingNumber?: string; courierName?: string; deliveryNotes?: string; processedBy?: string },
  ) {
    return this.giftService.updateOrderStatus(id, body.status, {
      rejectionReason: body.rejectionReason,
      trackingNumber: body.trackingNumber,
      courierName: body.courierName,
      deliveryNotes: body.deliveryNotes,
      processedBy: body.processedBy,
    });
  }

  @Delete('orders/:id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a gift order' })
  @ApiResponse({ status: 200, description: 'Gift order deleted successfully' })
  deleteOrder(@Param('id') id: string) {
    return this.giftService.deleteOrder(id);
  }
}
