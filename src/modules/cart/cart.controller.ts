import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { MobileJwtGuard } from '../mobile-auth/mobile-jwt.guard';

@ApiTags('Cart')
@Controller('mobile')
@UseGuards(MobileJwtGuard)
@ApiBearerAuth('JWT-auth')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // ── Cart ───────────────────────────────────────────────────────────────────

  @Get('cart')
  @ApiOperation({ summary: 'Get current user cart' })
  getCart(@Request() req: any) {
    return this.cartService.getCart(req.user.id, req.user.role);
  }

  @Post('cart')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add product to cart' })
  addToCart(
    @Request() req: any,
    @Body() body: { productId: string; quantity?: number },
  ) {
    return this.cartService.addToCart(req.user.id, req.user.role, body);
  }

  @Put('cart/:id')
  @ApiOperation({ summary: 'Update cart item quantity' })
  updateCartItem(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { quantity: number },
  ) {
    return this.cartService.updateCartItem(req.user.id, req.user.role, id, body);
  }

  @Delete('cart/:id')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeFromCart(@Request() req: any, @Param('id') id: string) {
    return this.cartService.removeFromCart(req.user.id, req.user.role, id);
  }

  @Delete('cart')
  @ApiOperation({ summary: 'Clear entire cart' })
  clearCart(@Request() req: any) {
    return this.cartService.clearCart(req.user.id, req.user.role);
  }

  // ── Product Orders ─────────────────────────────────────────────────────────

  @Post('product-orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buy now — create a product order directly' })
  createOrder(
    @Request() req: any,
    @Body() body: { productId: string; quantity?: number; shippingAddress?: string },
  ) {
    return this.cartService.createOrder(req.user.id, req.user.role, body);
  }

  @Post('cart/checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Checkout — place orders for all cart items and clear cart' })
  checkoutCart(
    @Request() req: any,
    @Body() body: { shippingAddress?: string },
  ) {
    return this.cartService.checkoutCart(req.user.id, req.user.role, body);
  }

  @Get('product-orders')
  @ApiOperation({ summary: 'Get my product order history' })
  getMyOrders(@Request() req: any) {
    return this.cartService.getMyOrders(req.user.id, req.user.role);
  }
}
