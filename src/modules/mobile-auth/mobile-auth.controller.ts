import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MobileAuthService } from './mobile-auth.service';
import {
  MobileLoginDto,
  VerifyOtpDto,
  MobileRefreshDto,
  PasswordLoginDto,
  RegisterCounterBoyDto,
  RegisterDealerDto,
  RegisterElectricianDto,
  RegisterUserDto,
  SendSignupOtpDto,
  VerifySignupOtpDto,
} from './dto/mobile-login.dto';
import { MobileJwtGuard } from './mobile-jwt.guard';

@ApiTags('Mobile App Auth')
@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly mobileAuthService: MobileAuthService) {}

  // ── Login ──────────────────────────────────────────────────────────────────

  @Post('send-otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone (all 4 roles: dealer, electrician, user, counterboy)' })
  sendOtp(@Body() dto: MobileLoginDto) {
    return this.mobileAuthService.sendOtp(dto);
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and get tokens (all 4 roles)' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.mobileAuthService.verifyOtp(dto);
  }

  @Post('password-login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone + password (all 4 roles)' })
  passwordLogin(@Body() body: PasswordLoginDto) {
    return this.mobileAuthService.passwordLogin(body.phone, body.role, body.password);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: MobileRefreshDto) {
    return this.mobileAuthService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (client-side token invalidation)' })
  logout() {
    return { success: true, message: 'Logged out successfully' };
  }

  // ── Signup OTP ─────────────────────────────────────────────────────────────

  @Post('signup/send-otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP for new user signup (all 4 roles)' })
  sendSignupOtp(@Body() body: SendSignupOtpDto) {
    return this.mobileAuthService.sendSignupOtp(body.phone, body.role);
  }

  @Post('signup/verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify signup OTP (all 4 roles)' })
  verifySignupOtp(@Body() body: VerifySignupOtpDto) {
    return this.mobileAuthService.verifySignupOtp(body.phone, body.role, body.otp);
  }

  // ── Signup Registration ────────────────────────────────────────────────────

  @Post('signup/dealer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new dealer' })
  registerDealer(@Body() body: RegisterDealerDto) {
    return this.mobileAuthService.registerDealer(body);
  }

  @Post('signup/electrician')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new electrician' })
  registerElectrician(@Body() body: RegisterElectricianDto) {
    return this.mobileAuthService.registerElectrician(body);
  }

  @Post('signup/user')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new customer/user' })
  registerUser(@Body() body: RegisterUserDto) {
    return this.mobileAuthService.registerUser(body);
  }

  @Post('signup/counterboy')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new counter boy' })
  registerCounterBoy(@Body() body: RegisterCounterBoyDto) {
    return this.mobileAuthService.registerCounterBoy(body);
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  @Get('profile')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile (all 4 roles)' })
  getProfile(@Request() req: any) {
    return this.mobileAuthService.getProfile(req.user.id, req.user.role);
  }

  @Patch('profile')
  @UseGuards(MobileJwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user profile (all 4 roles)' })
  updateProfile(@Request() req: any, @Body() data: any) {
    return this.mobileAuthService.updateProfile(req.user.id, req.user.role, data);
  }
}
