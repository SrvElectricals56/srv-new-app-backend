import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CartService } from './cart.service';

@ApiTags('Razorpay Webhook')
@Controller('payments/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly cartService: CartService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive signed Razorpay payment events' })
  webhook(
    @Req() req: any,
    @Headers('x-razorpay-signature') signature: string,
    @Body() payload: any,
  ) {
    return this.cartService.handleRazorpayWebhook(signature, req.rawBody, payload);
  }
}
