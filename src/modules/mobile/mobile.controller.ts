import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MobileService } from './mobile.service';
import { MobileAuthService } from '../mobile-auth/mobile-auth.service';
import { MobileJwtGuard } from '../mobile-auth/mobile-jwt.guard';

@ApiTags('Mobile App')
@Controller('mobile')
export class MobileController {
  constructor(
    private readonly mobileService: MobileService,
    private readonly mobileAuthService: MobileAuthService,
  ) {}

  // ── Products ───────────────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'Get all active products for app' })
  getProducts(@Query('category') category?: string) {
    return this.mobileService.getProducts(category);
  }

  @Get('products/categories')
  @ApiOperation({ summary: 'Get product categories' })
  getProductCategories() {
    return this.mobileService.getProductCategories();
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  getProductById(@Param('id') id: string) {
    return this.mobileService.getProductById(id);
  }

  // ── Banners ────────────────────────────────────────────────────────────────

  @Get('banners')
  @ApiOperation({ summary: 'Get active banners for app' })
  getBanners(@Query('role') role?: string) {
    return this.mobileService.getBanners(role);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  @Get('notifications')
  @ApiOperation({ summary: 'Get notifications for app' })
  getNotifications(@Query('role') role?: string, @Query('userId') userId?: string) {
    return this.mobileService.getNotifications(userId, role);
  }

  @Delete('notifications/:id')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a notification' })
  deleteNotification(@Param('id') id: string) {
    return this.mobileService.deleteNotification(id);
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  @Get('settings/maintenance')
  @ApiOperation({ summary: 'Get maintenance mode status' })
  getMaintenance() {
    return this.mobileService.getMaintenanceMode();
  }

  @Get('app-settings')
  @ApiOperation({ summary: 'Get public app settings' })
  getAppSettings() {
    return this.mobileService.getAppSettings();
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  @Get('offers')
  @ApiOperation({ summary: 'Get active offers/rewards for app' })
  getOffers(@Query('role') role?: string) {
    return this.mobileService.getOffers(role);
  }

  // ── Testimonials ───────────────────────────────────────────────────────────

  @Get('testimonials')
  @ApiOperation({ summary: 'Get active testimonials for app' })
  getTestimonials() {
    return this.mobileService.getTestimonials();
  }

  // ── Gift Products ──────────────────────────────────────────────────────────

  @Get('gift-products')
  @ApiOperation({ summary: 'Get gift products for app' })
  getGiftProducts(@Query('role') role?: string) {
    return this.mobileService.getGiftProducts(role);
  }

  // ── Reward Schemes ─────────────────────────────────────────────────────────

  @Get('reward-schemes')
  @ApiOperation({ summary: 'Get reward schemes for app' })
  getRewardSchemes(@Query('category') category?: string) {
    return this.mobileService.getRewardSchemes(category);
  }

  // ── Festival Theme ─────────────────────────────────────────────────────────

  @Get('festival/theme')
  @ApiOperation({ summary: 'Get active festival theme' })
  getFestivalTheme() {
    return this.mobileService.getFestivalTheme();
  }

  // ── Dealer Lookup ──────────────────────────────────────────────────────────

  @Get('dealer/by-phone')
  @ApiOperation({ summary: 'Lookup dealer by phone number' })
  getDealerByPhone(@Query('phone') phone: string) {
    return this.mobileService.getDealerByPhone(phone);
  }

  // ── Scan ───────────────────────────────────────────────────────────────────

  @Post('scan')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a QR scan and earn points' })
  submitScan(@Request() req: any, @Body() body: { qrCode: string; mode: 'single' | 'multi' }) {
    return this.mobileService.submitScan(req.user.id, req.user.role, body.qrCode, body.mode);
  }

  @Post('scan/preview')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview QR validity, product, and reward before redeeming' })
  previewScan(@Body() body: { qrCode: string }) {
    return this.mobileService.previewQrCode(body.qrCode);
  }

  @Get('scan-history')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get scan history for current user' })
  getScanHistory(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.mobileService.getScanHistory(req.user.id, parseInt(page), parseInt(limit));
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  @Get('wallet')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get wallet balance and transaction history' })
  getWallet(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.mobileService.getWallet(req.user.id, req.user.role, parseInt(page), parseInt(limit));
  }

  @Post('wallet/bank-account')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save bank account details' })
  saveBankAccount(@Request() req: any, @Body() body: any) {
    return this.mobileService.saveBankAccount(req.user.id, req.user.role, body);
  }

  @Post('wallet/redeem')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem points for a reward' })
  redeemReward(@Request() req: any, @Body() body: { schemeId: string; note?: string }) {
    return this.mobileService.redeemReward(req.user.id, req.user.role, body);
  }

  @Post('wallet/transfer')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer points to another user' })
  transferPoints(@Request() req: any, @Body() body: { receiverPhone: string; points: number }) {
    return this.mobileService.transferPoints(req.user.id, req.user.role, body);
  }

  @Get('wallet/dealer-bonus')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get dealer bonus info' })
  getDealerBonus(@Request() req: any) {
    return this.mobileService.getDealerBonus(req.user.id);
  }

  @Post('wallet/dealer-bonus/withdrawals')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request dealer bonus withdrawal' })
  requestDealerBonusWithdrawal(@Request() req: any, @Body() body: { amount: number }) {
    return this.mobileService.requestDealerBonusWithdrawal(req.user.id, body);
  }

  @Get('redemptions')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get redemption history for current user' })
  getRedemptionHistory(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.mobileService.getRedemptionHistory(req.user.id, parseInt(page), parseInt(limit));
  }

  // ── Electricians (for dealer) ──────────────────────────────────────────────

  @Get('electricians')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get electricians for dealer' })
  getDealerElectricians(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
  ) {
    return this.mobileService.getDealerElectricians(req.user.id, parseInt(page), parseInt(limit), search);
  }

  @Get('electricians/call-list')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get electrician call list for dealer' })
  getDealerElectriciansCallList(@Request() req: any) {
    return this.mobileService.getDealerElectriciansCallList(req.user.id);
  }

  @Post('electricians')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add electrician to dealer network' })
  addElectrician(@Request() req: any, @Body() body: any) {
    return this.mobileService.addElectrician(req.user.id, body);
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  @Get('profile/orders')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get gift orders for current user' })
  getMyOrders(@Request() req: any) {
    return this.mobileService.getMyOrders(req.user.id);
  }

  @Patch('profile/photo')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload/update profile photo' })
  updateProfilePhoto(@Request() req: any, @Body() body: { profileImage: string; source?: string }) {
    return this.mobileAuthService.updateProfilePhoto(req.user.id, req.user.role, body.profileImage);
  }

  @Delete('profile/photo')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove profile photo' })
  removeProfilePhoto(@Request() req: any) {
    return this.mobileAuthService.removeProfilePhoto(req.user.id, req.user.role);
  }

  @Get('profile/qr-code')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user QR code' })
  getUserQrCode(@Request() req: any) {
    return this.mobileAuthService.getUserQrCode(req.user.id, req.user.role);
  }

  @Patch('profile/password')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change password' })
  changePassword(@Request() req: any, @Body() body: { currentPassword?: string; newPassword: string }) {
    return this.mobileAuthService.changePassword(req.user.id, req.user.role, body);
  }

  // ── Support ────────────────────────────────────────────────────────────────

  @Post('support')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create support ticket' })
  createSupportTicket(@Request() req: any, @Body() body: { subject: string; comment: string; photoUrl?: string }) {
    return this.mobileService.createSupportTicket(req.user.id, req.user.role, body);
  }

  // ── Referral ───────────────────────────────────────────────────────────────

  @Get('referral')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get referral code and link' })
  getReferral(@Request() req: any) {
    return this.mobileService.getReferral(req.user.id, req.user.role);
  }

  // ── Rating ─────────────────────────────────────────────────────────────────

  @Post('rating')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit app rating' })
  submitRating(@Request() req: any, @Body() body: { rating: number; review?: string }) {
    return this.mobileService.submitRating(req.user.id, body.rating, body.review);
  }

  @Get('rating')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user app rating' })
  getRating(@Request() req: any) {
    return this.mobileService.getRating(req.user.id);
  }
}
