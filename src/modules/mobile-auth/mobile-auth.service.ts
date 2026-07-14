import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Scan } from '../../database/entities/scan.entity';
import { MobileLoginDto, VerifyOtpDto, MobileUserRole } from './dto/mobile-login.dto';
import { ElectricianSubCategory, UserStatus } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';
import { CrossRolePhoneService } from '../../common/services/cross-role-phone.service';
import { resolveFixedOtp } from '../../common/utils/otp-policy.util';

// In-memory OTP store (production mein Redis use karein)
const otpStore = new Map<
  string,
  { otp: string; expiresAt: number; failedAttempts: number; verifiedAt?: number }
>();
const SIGNUP_OTP_VERIFIED = 'VERIFIED';

@Injectable()
export class MobileAuthService {
  constructor(
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterboyRepository: Repository<CounterBoy>,
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
    private readonly tierService: TierService,
    private readonly crossRolePhoneService: CrossRolePhoneService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getFixedOtp(): string | null {
    return resolveFixedOtp({
      nodeEnv: this.configService.get<string>('NODE_ENV'),
      appEnv: this.configService.get<string>('APP_ENV'),
      testMode: this.configService.get<string>('OTP_TEST_MODE'),
      testCode: this.configService.get<string>('OTP_TEST_CODE'),
    });
  }

  private generateOtp(): string {
    return this.getFixedOtp() ?? randomInt(1000, 10_000).toString();
  }

  private exposeTestOtp(): boolean {
    return this.getFixedOtp() !== null;
  }

  private async generateTokens(payload: { sub: string; phone: string; role: string }) {
    let tokenVersion = 0;
    try {
      const userRepo = this.getRepositoryByRole(payload.role);
      const user: any = await userRepo.findOne({ where: { id: payload.sub } });
      if (user && typeof user.tokenVersion === 'number') tokenVersion = user.tokenVersion;
    } catch {}

    const tokenPayload = { ...payload, tokenVersion };
    const accessToken = this.jwtService.sign(tokenPayload);
    const refreshToken = this.jwtService.sign(tokenPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });
    return { accessToken, refreshToken };
  }

  private async hashPassword(password?: string) {
    const trimmed = password?.trim();
    if (!trimmed) return null;
    this.assertStrongPassword(trimmed);
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(trimmed, salt);
  }

  private assertStrongPassword(password: string) {
    if (!/^\S{8,}$/.test(password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }
  }

  private verifyStoredOtp(phone: string, role: MobileUserRole, otp: string, keyOverride?: string) {
    const normalizedPhone = this.normalizePhone(phone);
    const key = keyOverride ?? this.buildLoginOtpKey(normalizedPhone, role);
    const stored = otpStore.get(key);

    if (!stored) throw new BadRequestException('OTP not found or expired. Please request a new OTP.');
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      throw new BadRequestException('OTP expired. Please request a new OTP.');
    }
    if (stored.otp !== otp) {
      stored.failedAttempts += 1;
      if (stored.failedAttempts >= 5) {
        otpStore.delete(key);
        throw new UnauthorizedException('Too many invalid OTP attempts. Request a new OTP.');
      }
      throw new UnauthorizedException('Invalid OTP.');
    }

    return { key, stored, normalizedPhone };
  }

  private normalizePhone(phone?: string | null): string {
    return String(phone ?? '').replace(/\D/g, '').slice(-10);
  }

  private buildLoginOtpKey(phone: string, role: MobileUserRole): string {
    return `${this.normalizePhone(phone)}:${role}`;
  }

  private buildPasswordResetOtpKey(phone: string, role: MobileUserRole): string {
    return `reset:${this.normalizePhone(phone)}:${role}`;
  }

  private normalizeElectricianCode(code?: string | null): string | null {
    const trimmed = code?.trim();
    if (!trimmed || trimmed.includes('###')) {
      return null;
    }

    return trimmed.toUpperCase();
  }

  private buildFallbackElectricianCode(phone?: string | null): string {
    const phoneSuffix = String(phone ?? '').replace(/\D/g, '').slice(-4) || '0000';
    return `ELC-${phoneSuffix}-${Date.now().toString().slice(-6)}`;
  }

  private async generateNextElectricianCodeForDealer(dealerId: string, dealerCode: string): Promise<string> {
    const prefix = `${dealerCode.trim().toUpperCase()}-`;
    const linkedElectricians = await this.electricianRepository.find({
      where: { dealerId },
      select: ['electricianCode'],
    });

    let maxSerial = 0;
    for (const linkedElectrician of linkedElectricians) {
      const code = linkedElectrician.electricianCode?.trim().toUpperCase();
      if (!code?.startsWith(prefix)) continue;

      const suffix = code.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;

      maxSerial = Math.max(maxSerial, Number.parseInt(suffix, 10) || 0);
    }

    return `${prefix}${String(maxSerial + 1).padStart(3, '0')}`;
  }

  private async hydrateCounterBoyDealer<T extends { dealerId?: string | null }>(counterboy: T | null) {
    if (!counterboy) return null;
    if (!counterboy.dealerId) return { ...counterboy, dealer: null };

    const dealer = await this.dealerRepository.findOne({
      where: { id: String(counterboy.dealerId) },
    });

    return { ...counterboy, dealer };
  }

  private async hydrateElectricianDealer<T extends { id?: string; dealerId?: string | null }>(electrician: T | null) {
    if (!electrician) return null;
    if (!electrician.dealerId) return { ...electrician, dealer: null };

    const dealer = await this.dealerRepository
      .createQueryBuilder('dealer')
      .where('dealer.id::text = :dealerId', { dealerId: String(electrician.dealerId) })
      .getOne();

    return { ...electrician, dealer };
  }

  /** Find user entity by phone + role */
  private async findUserByPhone(phone: string, role: MobileUserRole): Promise<any> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) return null;

    const repo = this.getRepositoryByRole(role);
    const alias =
      role === 'electrician'
        ? 'electrician'
        : role === 'dealer'
          ? 'dealer'
          : role === 'user'
            ? 'user'
            : 'counterboy';

    const query = repo
      .createQueryBuilder(alias)
      .where(`${alias}.phone = :rawPhone`, { rawPhone: phone })
      .orWhere(
        `regexp_replace(regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g'), '^0+', '') = regexp_replace(:normalizedPhone, '^0+', '')`,
        { normalizedPhone },
    );

    if (role === 'electrician') {
      query.leftJoinAndMapOne(
        `${alias}.dealer`,
        Dealer,
        'dealer',
        `dealer.id::text = ${alias}."dealerId"::text`,
      );
    }

    const user = await query.getOne();
    if (role === 'counterboy') {
      return this.hydrateCounterBoyDealer(user as CounterBoy | null);
    }

    return user;
  }

  private getRepositoryByRole(role: string) {
    switch (role) {
      case 'electrician':
        return this.electricianRepository;
      case 'dealer':
        return this.dealerRepository;
      case 'user':
        return this.appUserRepository;
      case 'counterboy':
        return this.counterboyRepository;
      default:
        throw new NotFoundException('Unknown role');
    }
  }

  private async getUserEntityByRole(userId: string, role: string): Promise<any> {
    return this.getRepositoryByRole(role).findOne({
      where: { id: userId } as any,
    });
  }

  /** Update lastActivityAt for any role, and mark appInstalled on first login */
  private async touchActivity(id: string, role: MobileUserRole) {
    const now = new Date();
    switch (role) {
      case 'electrician': {
        const existing = await this.electricianRepository.findOne({ where: { id }, select: ['id', 'appInstalled'] });
        const update: any = { lastActivityAt: now };
        if (existing && !existing.appInstalled) {
          update.appInstalled = true;
          update.firstAppLoginAt = now;
        }
        await this.electricianRepository.update(id, update);
        break;
      }
      case 'dealer': {
        const existing = await this.dealerRepository.findOne({ where: { id }, select: ['id', 'appInstalled'] });
        const update: any = { lastActivityAt: now };
        if (existing && !existing.appInstalled) {
          update.appInstalled = true;
          update.firstAppLoginAt = now;
        }
        await this.dealerRepository.update(id, update);
        break;
      }
      case 'user': {
        const existing = await this.appUserRepository.findOne({ where: { id }, select: ['id', 'appInstalled'] });
        const update: any = { lastActivityAt: now };
        if (existing && !existing.appInstalled) {
          update.appInstalled = true;
          update.firstAppLoginAt = now;
        }
        await this.appUserRepository.update(id, update);
        break;
      }
      case 'counterboy': {
        const existing = await this.counterboyRepository.findOne({ where: { id }, select: ['id', 'appInstalled'] });
        const update: any = { lastActivityAt: now };
        if (existing && !existing.appInstalled) {
          update.appInstalled = true;
          update.firstAppLoginAt = now;
        }
        await this.counterboyRepository.update(id, update);
        break;
      }
    }
  }

  private buildSignupOtpKey(phone: string, role: MobileUserRole): string {
    return `signup:${phone}:${role}`;
  }

  private ensureSignupOtpVerified(phone: string, role: MobileUserRole): string {
    const key = this.buildSignupOtpKey(phone, role);
    const stored = otpStore.get(key);

    if (!stored || stored.otp !== SIGNUP_OTP_VERIFIED) {
      throw new BadRequestException('Signup OTP verification required before registration.');
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      throw new BadRequestException('Signup OTP expired. Please request and verify a new OTP.');
    }

    return key;
  }

  // ── Login OTP ──────────────────────────────────────────────────────────────

  async sendOtp(dto: MobileLoginDto) {
    const { role } = dto;
    const phone = this.normalizePhone(dto.phone);
    const user = await this.findUserByPhone(phone, role);

    if (!user) {
      const existingRegistration = await this.crossRolePhoneService.findPrimaryRegistrationByPhone(phone);
      if (existingRegistration) {
        throw new ConflictException(
          this.crossRolePhoneService.buildLoginRoleMismatchMessage(existingRegistration.role),
        );
      }

      const roleLabel = role === 'electrician' ? 'Electrician not registered. Please contact your dealer.'
        : role === 'dealer' ? 'Dealer not registered. Please contact SRV admin.'
        : role === 'user' ? 'User not registered. Please sign up first.'
        : 'Counter boy not registered. Please contact your dealer.';
      throw new NotFoundException(roleLabel);
    }

    if (user.status === 'suspended') {
      throw new UnauthorizedException('Account is suspended. Contact support.');
    }

    const otp = this.generateOtp();
    const key = this.buildLoginOtpKey(phone, role);
    otpStore.set(key, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      failedAttempts: 0,
    });

    return {
      success: true,
      message: 'OTP sent successfully',
      ...(this.exposeTestOtp() && { devOtp: otp }),
    };
  }

  async sendPasswordResetOtp(dto: MobileLoginDto) {
    const { role } = dto;
    const phone = this.normalizePhone(dto.phone);
    const user = await this.findUserByPhone(phone, role);

    if (!user) {
      const existingRegistration = await this.crossRolePhoneService.findPrimaryRegistrationByPhone(phone);
      if (existingRegistration) {
        throw new ConflictException(
          this.crossRolePhoneService.buildLoginRoleMismatchMessage(existingRegistration.role),
        );
      }

      const roleLabel = role === 'electrician' ? 'Electrician not registered. Please contact your dealer.'
        : role === 'dealer' ? 'Dealer not registered. Please contact SRV admin.'
        : role === 'user' ? 'User not registered. Please sign up first.'
        : 'Counter boy not registered. Please contact your dealer.';
      throw new NotFoundException(roleLabel);
    }

    if (user.status === 'suspended') {
      throw new UnauthorizedException('Account is suspended. Contact support.');
    }

    const otp = this.generateOtp();
    otpStore.set(this.buildPasswordResetOtpKey(phone, role), {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      failedAttempts: 0,
    });

    return {
      success: true,
      message: 'OTP sent successfully',
      ...(this.exposeTestOtp() && { devOtp: otp }),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, role, otp } = dto;
    const { key, normalizedPhone } = this.verifyStoredOtp(phone, role, otp);
    otpStore.delete(key);

    const user = await this.findUserByPhone(normalizedPhone, role);
    if (!user) throw new NotFoundException('User not found');

    await this.touchActivity(user.id, role);

    const payload = { sub: user.id, phone: user.phone, role };
    const tokens = await this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(user, role) };
  }

  // ── Signup OTP ─────────────────────────────────────────────────────────────

  async sendSignupOtp(phone: string, role: MobileUserRole) {
    await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, role);

    const otp = this.generateOtp();
    const key = this.buildSignupOtpKey(phone, role);
    otpStore.set(key, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      failedAttempts: 0,
    });

    return {
      success: true,
      message: 'OTP sent successfully',
      ...(this.exposeTestOtp() && { devOtp: otp }),
    };
  }

  async verifySignupOtp(phone: string, role: MobileUserRole, otp: string) {
    await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, role);

    const key = this.buildSignupOtpKey(phone, role);
    const stored = otpStore.get(key);

    if (!stored) throw new BadRequestException('OTP not found or expired.');
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      throw new BadRequestException('OTP expired. Please request a new OTP.');
    }
    if (stored.otp !== otp) {
      stored.failedAttempts += 1;
      if (stored.failedAttempts >= 5) {
        otpStore.delete(key);
        throw new UnauthorizedException(
          'Too many invalid OTP attempts. Request a new OTP.',
        );
      }
      throw new UnauthorizedException('Invalid OTP.');
    }
    // Mark as verified for signup completion
    otpStore.set(key, {
      otp: SIGNUP_OTP_VERIFIED,
      expiresAt: Date.now() + 15 * 60 * 1000,
      failedAttempts: 0,
    });

    return { success: true, message: 'OTP verified successfully' };
  }

  // ── Signup Registration ────────────────────────────────────────────────────

  async registerDealer(data: {
    name: string; phone: string; email?: string; town: string;
    district: string; state: string; address: string; pincode?: string;
    gstNumber?: string; password?: string;
  }) {
    const signupOtpKey = this.ensureSignupOtpVerified(data.phone, 'dealer');
    await this.crossRolePhoneService.assertPhoneAvailableForRole(data.phone, 'dealer');

    const stateCode = data.state?.substring(0, 2).toUpperCase() ?? 'XX';
    const dealerCode = `DLR${stateCode}${Date.now().toString().slice(-6)}`;

    const passwordHash = await this.hashPassword(data.password);

    const dealer = this.dealerRepository.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      town: data.town,
      district: data.district,
      state: data.state,
      address: data.address,
      pincode: data.pincode,
      gstNumber: data.gstNumber,
      dealerCode,
      status: UserStatus.PENDING,
    });
    (dealer as any).passwordHash = passwordHash;
    // Signup = app is installed by definition
    (dealer as any).appInstalled = true;
    (dealer as any).firstAppLoginAt = new Date();

    const saved = await this.dealerRepository.save(dealer) as Dealer;
    otpStore.delete(signupOtpKey);
    const payload = { sub: saved.id, phone: saved.phone, role: 'dealer' };
    const tokens = await this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(saved, 'dealer') };
  }

  async registerElectrician(data: {
    name: string; phone: string; email?: string; city: string;
    district: string; state: string; address?: string; pincode?: string;
    dealerPhone: string; password?: string; subCategory?: string; electricianCode?: string;
  }) {
    const signupOtpKey = this.ensureSignupOtpVerified(data.phone, 'electrician');
    await this.crossRolePhoneService.assertPhoneAvailableForRole(data.phone, 'electrician');

    const normalizedDealerPhone = this.normalizePhone(data.dealerPhone);
    let dealerId: string | undefined;
    let dealerCode: string | undefined;
    let fallbackDealerName: string | undefined;
    let fallbackDealerPhone: string | undefined;
    if (data.dealerPhone) {
      const dealer = await this.findUserByPhone(data.dealerPhone, 'dealer');
      if (dealer) {
        dealerId = dealer.id;
        dealerCode = dealer.dealerCode;
      } else {
        fallbackDealerName = 'SRV Dealer';
        fallbackDealerPhone = normalizedDealerPhone;
      }
    }

    const manualCode = this.normalizeElectricianCode(data.electricianCode);
    const electricianCode = manualCode
      ?? (dealerId && dealerCode
        ? await this.generateNextElectricianCodeForDealer(dealerId, dealerCode)
        : this.buildFallbackElectricianCode(data.phone));
    const existingCode = await this.electricianRepository.findOne({ where: { electricianCode } });
    if (existingCode) throw new ConflictException('Electrician code already exists.');

    const passwordHash = await this.hashPassword(data.password);

    const electrician = this.electricianRepository.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      district: data.district,
      state: data.state,
      address: data.address,
      pincode: data.pincode,
      dealerId,
      fallbackDealerName,
      fallbackDealerPhone,
      electricianCode,
      subCategory: (data.subCategory as ElectricianSubCategory) ?? ElectricianSubCategory.GENERAL_ELECTRICIAN,
      status: UserStatus.ACTIVE,
    });
    (electrician as any).passwordHash = passwordHash;
    // Signup = app is installed by definition
    (electrician as any).appInstalled = true;
    (electrician as any).firstAppLoginAt = new Date();

    const saved = await this.electricianRepository.save(electrician) as Electrician;
    if (fallbackDealerPhone) {
      await this.electricianRepository.query(
        `INSERT INTO "sub_dealers"
          ("phone", "name", "district", "pincode", "electricianCount")
         VALUES ($1, 'SRV Dealer', $2, $3, 1)
         ON CONFLICT ("phone") DO UPDATE SET
          "name" = 'SRV Dealer',
          "district" = COALESCE(EXCLUDED."district", "sub_dealers"."district"),
          "pincode" = COALESCE(EXCLUDED."pincode", "sub_dealers"."pincode"),
          "electricianCount" = "sub_dealers"."electricianCount" + 1,
          "lastSeenAt" = now()`,
        [fallbackDealerPhone, data.district || null, data.pincode || null],
      );
    }
    otpStore.delete(signupOtpKey);
    if (dealerId) {
      await this.tierService.syncDealerTier(dealerId);
    }
    const savedWithDealer = await this.hydrateElectricianDealer(saved);

    const payload = { sub: saved.id, phone: saved.phone, role: 'electrician' };
    const tokens = await this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(savedWithDealer ?? saved, 'electrician') };
  }

  async registerUser(data: {
    name: string; phone: string; email?: string; city?: string;
    state?: string; district?: string; address?: string; pincode?: string;
    password?: string;
  }) {
    const signupOtpKey = this.ensureSignupOtpVerified(data.phone, 'user');
    await this.crossRolePhoneService.assertPhoneAvailableForRole(data.phone, 'user');

    const stateCode = data.state?.substring(0, 2).toUpperCase() ?? 'XX';
    const userCode = `USR${stateCode}${Date.now().toString().slice(-6)}`;

    const passwordHash = await this.hashPassword(data.password);

    const appUser = this.appUserRepository.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      state: data.state,
      district: data.district,
      address: data.address,
      pincode: data.pincode,
      userCode,
      status: UserStatus.ACTIVE,
      passwordHash,
      appInstalled: true,
      firstAppLoginAt: new Date(),
    });

    const saved = await this.appUserRepository.save(appUser);
    otpStore.delete(signupOtpKey);
    const payload = { sub: saved.id, phone: saved.phone, role: 'user' };
    const tokens = await this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(saved, 'user') };
  }

  async registerCounterBoy(data: {
    name: string; phone: string; email?: string; city?: string;
    state?: string; district?: string; address?: string; pincode?: string;
    password?: string;
  }) {
    const signupOtpKey = this.ensureSignupOtpVerified(data.phone, 'counterboy');
    await this.crossRolePhoneService.assertPhoneAvailableForRole(data.phone, 'counterboy');

    const stateCode = data.state?.substring(0, 2).toUpperCase() ?? 'XX';
    const counterboyCode = `CBY${stateCode}${Date.now().toString().slice(-6)}`;

    const passwordHash = await this.hashPassword(data.password);

    const counterboy = this.counterboyRepository.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      state: data.state,
      district: data.district,
      address: data.address,
      pincode: data.pincode,
      counterboyCode,
      status: UserStatus.ACTIVE,
      passwordHash,
      appInstalled: true,
      firstAppLoginAt: new Date(),
    });

    const saved = await this.counterboyRepository.save(counterboy);
    otpStore.delete(signupOtpKey);
    const savedWithDealer = await this.hydrateCounterBoyDealer(
      await this.counterboyRepository.findOne({ where: { id: saved.id } }),
    );

    const payload = { sub: saved.id, phone: saved.phone, role: 'counterboy' };
    const tokens = await this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(savedWithDealer ?? saved, 'counterboy') };
  }

  // ── Password Login ─────────────────────────────────────────────────────────

  async passwordLogin(phone: string, role: MobileUserRole, password: string) {
    const user = await this.findUserByPhone(phone, role);

    if (!user) {
      const existingRegistration = await this.crossRolePhoneService.findPrimaryRegistrationByPhone(phone);
      if (existingRegistration) {
        throw new ConflictException(
          this.crossRolePhoneService.buildLoginRoleMismatchMessage(existingRegistration.role),
        );
      }
      throw new NotFoundException('User not found.');
    }
    if (user.status === 'suspended') throw new UnauthorizedException('Account is suspended.');

    const isDev = this.configService.get('NODE_ENV') === 'development';

    // If no password provided and no passwordHash set → allow login (OTP-registered users)
    if (!password?.trim()) {
      throw new BadRequestException('Password is required. Please use OTP login if you do not have a password.');
    }

    if (isDev && password === '1234') {
      // Allow dev shortcut
    } else if (user.passwordHash) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new UnauthorizedException('Invalid password.');
    } else {
      // No passwordHash set — treat any password attempt as invalid, suggest OTP
      throw new BadRequestException('No password set for this account. Please use OTP login instead.');
    }

    await this.touchActivity(user.id, role);

    const payload = { sub: user.id, phone: user.phone, role };
    const tokens = await this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(user, role) };
  }

  async resetPasswordWithOtp(phone: string, role: MobileUserRole, otp: string, newPassword: string) {
    const trimmedPassword = newPassword?.trim();
    if (!trimmedPassword) {
      throw new BadRequestException('New password is required');
    }
    this.assertStrongPassword(trimmedPassword);

    const resetKey = this.buildPasswordResetOtpKey(phone, role);
    const { key, stored, normalizedPhone } = this.verifyStoredOtp(phone, role, otp, resetKey);
    if (!stored.verifiedAt) {
      throw new BadRequestException('Please verify OTP before updating password.');
    }

    const user = await this.findUserByPhone(normalizedPhone, role);
    if (!user) throw new NotFoundException('User not found.');

    const passwordHash = await this.hashPassword(trimmedPassword);
    await this.getRepositoryByRole(role).update(user.id, { passwordHash } as any);
    await (this.getRepositoryByRole(role) as any).increment({ id: user.id }, 'tokenVersion', 1);
    otpStore.delete(key);

    return { success: true, message: 'Password reset successfully' };
  }

  async verifyPasswordResetOtp(phone: string, role: MobileUserRole, otp: string) {
    const resetKey = this.buildPasswordResetOtpKey(phone, role);
    const { stored } = this.verifyStoredOtp(phone, role, otp, resetKey);
    stored.verifiedAt = Date.now();
    return { success: true, message: 'OTP verified successfully' };
  }

  // ── Token Refresh ──────────────────────────────────────────────────────────

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.findUserByPhone(payload.phone, payload.role as MobileUserRole);
      if (!user) throw new UnauthorizedException('User not found');

      const tokens = await this.generateTokens({ sub: user.id, phone: user.phone, role: payload.role });
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async getProfile(userId: string, role: string) {
    let user: any;
    switch (role) {
      case 'electrician':
        user = await this.hydrateElectricianDealer(
          await this.electricianRepository.findOne({ where: { id: userId } }),
        );
        break;
      case 'dealer':
        user = await this.dealerRepository.findOne({ where: { id: userId } });
        break;
      case 'user':
        user = await this.appUserRepository.findOne({ where: { id: userId } });
        break;
      case 'counterboy':
        user = await this.hydrateCounterBoyDealer(
          await this.counterboyRepository.findOne({ where: { id: userId } }),
        );
        break;
      default:
        throw new NotFoundException('Unknown role');
    }
    if (!user) throw new NotFoundException('User not found');

    // Get actual scan count from scans table — correct for single and multi mode
    const actualScanCount = await this.scanRepository.count({ where: { userId } });

    // Sync denormalized counter if drifted
    if ((user.totalScans ?? 0) !== actualScanCount) {
      user.totalScans = actualScanCount;
      switch (role) {
        case 'electrician': await this.electricianRepository.update(userId, { totalScans: actualScanCount }); break;
        case 'counterboy':  await this.counterboyRepository.update(userId, { totalScans: actualScanCount }); break;
        default: break;
      }
    }

    return this.formatUserProfile(user, role);
  }

  async updateProfile(userId: string, role: string, data: any) {
    const commonFields = ['name', 'email', 'city', 'state', 'district', 'pincode', 'address',
      'upiId', 'bankAccount', 'ifsc', 'bankName', 'accountHolderName', 'bankLinked',
      'aadharFrontImage', 'panDocument', 'gstDocument'];

    const updateData: any = {};
    commonFields.forEach(k => { if (data[k] !== undefined) updateData[k] = data[k]; });
    if (role === 'user' || role === 'counterboy') {
      ['language', 'darkMode', 'pushEnabled'].forEach(k => {
        if (data[k] !== undefined) updateData[k] = data[k];
      });
    }
    if (data.profileImage !== undefined) updateData.profileImage = data.profileImage;

    // Handle plain-text password field (used by setPasswordFallback on the client)
    if (data.password !== undefined && typeof data.password === 'string' && data.password.trim()) {
      updateData.passwordHash = await this.hashPassword(data.password);
    }

    // Dealer-specific fields
    if (role === 'dealer') {
      if (data.town !== undefined) updateData.town = data.town;
      if (data.gstNumber !== undefined) updateData.gstNumber = data.gstNumber;
    }

    // If any KYC document is being submitted, set kycStatus to pending
    const kycDocFields = ['aadharFrontImage', 'panDocument', 'gstDocument'];
    const hasKycDoc = kycDocFields.some(k => data[k] !== undefined && data[k] !== null && data[k] !== '');
    if (hasKycDoc) {
      // Move to pending for any status except already pending
      // This covers: not_submitted, rejected, AND verified (re-verification after doc change)
      const currentUser = await this.getProfile(userId, role);
      const currentKycStatus = (currentUser as any).kycStatus;
      if (currentKycStatus !== 'pending') {
        updateData.kycStatus = 'pending';
        updateData.kycRejectionReason = null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      switch (role) {
        case 'electrician': await this.electricianRepository.update(userId, updateData); break;
        case 'dealer':      await this.dealerRepository.update(userId, updateData); break;
        case 'user':        await this.appUserRepository.update(userId, updateData); break;
        case 'counterboy':  await this.counterboyRepository.update(userId, updateData); break;
      }
    }

    if (data.pushEnabled !== undefined) {
      await this.electricianRepository.query(`
        CREATE TABLE IF NOT EXISTS "mobile_push_tokens" (
          "token" text PRIMARY KEY,
          "userId" text NOT NULL,
          "userRole" varchar(50) NOT NULL,
          "platform" varchar(20),
          "enabled" boolean NOT NULL DEFAULT true,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.electricianRepository.query(
        `UPDATE "mobile_push_tokens" SET "enabled" = $1, "updatedAt" = now() WHERE "userId" = $2 AND "userRole" = $3`,
        [Boolean(data.pushEnabled), userId, role],
      );
    }

    return this.getProfile(userId, role);
  }

  async updateProfilePhoto(userId: string, role: string, profileImage: string) {
    switch (role) {
      case 'electrician': await this.electricianRepository.update(userId, { profileImage }); break;
      case 'dealer':      await this.dealerRepository.update(userId, { profileImage }); break;
      case 'user':        await this.appUserRepository.update(userId, { profileImage }); break;
      case 'counterboy':  await this.counterboyRepository.update(userId, { profileImage }); break;
    }
    return this.getProfile(userId, role);
  }

  async removeProfilePhoto(userId: string, role: string) {
    switch (role) {
      case 'electrician': await this.electricianRepository.update(userId, { profileImage: null as any }); break;
      case 'dealer':      await this.dealerRepository.update(userId, { profileImage: null as any }); break;
      case 'user':        await this.appUserRepository.update(userId, { profileImage: null as any }); break;
      case 'counterboy':  await this.counterboyRepository.update(userId, { profileImage: null as any }); break;
    }
    return { removed: true };
  }

  async changePassword(userId: string, role: string, data: { currentPassword?: string; newPassword: string }) {
    const newPassword = data.newPassword?.trim();
    if (!newPassword) {
      throw new BadRequestException('New password is required');
    }

    this.assertStrongPassword(newPassword);

    const user = await this.getUserEntityByRole(userId, role);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentPassword = data.currentPassword?.trim();
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new BadRequestException('Current password is required');
      }

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const passwordHash = await this.hashPassword(newPassword);
    await this.getRepositoryByRole(role).update(userId, {
      passwordHash,
    } as any);
    await (this.getRepositoryByRole(role) as any).increment({ id: userId }, 'tokenVersion', 1);

    return { message: 'Password updated successfully' };
  }

  async getUserQrCode(userId: string, role: string) {
    const user = await this.getProfile(userId, role);
    const code = (user as any).electricianCode
      ?? (user as any).dealerCode
      ?? (user as any).userCode
      ?? (user as any).counterboyCode
      ?? userId;
    return {
      id: userId,
      userId,
      qrValue: code,
      qrApiUrl: null,
      storedQrImageUrl: null,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Format User Profile ────────────────────────────────────────────────────

  private getEffectivePoints(user: any) {
    return Number(user?.walletBalance ?? user?.totalPoints ?? 0);
  }

  formatUserProfile(user: any, role: string) {
    switch (role) {
      case 'electrician':
        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          electricianCode: user.electricianCode,
          city: user.city,
          state: user.state,
          district: user.district,
          pincode: user.pincode,
          address: user.address,
          tier: user.tier,
          subCategory: user.subCategory,
          totalPoints: this.getEffectivePoints(user),
          totalScans: user.totalScans,
          walletBalance: user.walletBalance,
          totalRedemptions: user.totalRedemptions,
          status: user.status,
          kycStatus: user.kycStatus,
          bankLinked: user.bankLinked,
          upiId: user.upiId,
          bankAccount: user.bankAccount,
          ifsc: user.ifsc,
          bankName: user.bankName,
          accountHolderName: user.accountHolderName,
          profileImage: user.profileImage ?? null,
          dealerId: user.dealerId,
          dealerName: user.dealer?.name ?? user.fallbackDealerName ?? null,
          dealerPhone: user.dealer?.phone ?? user.fallbackDealerPhone ?? null,
          dealerTown: user.dealer?.town ?? null,
          dealerCode: user.dealer?.dealerCode ?? null,
          aadharNumber: user.aadharNumber ?? null,
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          kycRejectionReason: user.kycRejectionReason ?? null,
          hasPassword: !!user.passwordHash,
          appInstalled: user.appInstalled ?? false,
          firstAppLoginAt: user.firstAppLoginAt ?? null,
          role: 'electrician',
        };

      case 'dealer':
        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          dealerCode: user.dealerCode,
          town: user.town,
          district: user.district,
          state: user.state,
          address: user.address,
          pincode: user.pincode,
          gstNumber: user.gstNumber,
          tier: user.tier,
          electricianCount: user.electricianCount,
          walletBalance: user.walletBalance,
          bonusPoints: Number((user as any).bonusPoints ?? 0),
          bonusStatus: (user as any).bonusStatus ?? 'pending',
          status: user.status,
          approvalRejectionReason: user.rejectionReason ?? null,
          kycStatus: user.kycStatus,
          bankLinked: user.bankLinked,
          upiId: user.upiId,
          bankAccount: user.bankAccount,
          ifsc: user.ifsc,
          bankName: user.bankName,
          accountHolderName: user.accountHolderName,
          profileImage: user.profileImage ?? null,
          aadharNumber: user.aadharNumber ?? null,
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          kycRejectionReason: user.kycRejectionReason ?? null,
          hasPassword: !!user.passwordHash,
          appInstalled: user.appInstalled ?? false,
          firstAppLoginAt: user.firstAppLoginAt ?? null,
          role: 'dealer',
        };

      case 'user':
        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          userCode: user.userCode,
          city: user.city,
          state: user.state,
          district: user.district,
          pincode: user.pincode,
          address: user.address,
          tier: user.tier,
          totalPoints: this.getEffectivePoints(user),
          walletBalance: user.walletBalance,
          totalRedemptions: user.totalRedemptions,
          status: user.status,
          kycStatus: user.kycStatus,
          bankLinked: user.bankLinked,
          upiId: user.upiId,
          bankAccount: user.bankAccount,
          ifsc: user.ifsc,
          bankName: user.bankName,
          accountHolderName: user.accountHolderName,
          profileImage: user.profileImage ?? null,
          aadharNumber: user.aadharNumber ?? null,
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          kycRejectionReason: user.kycRejectionReason ?? null,
          hasPassword: !!user.passwordHash,
          appInstalled: user.appInstalled ?? false,
          firstAppLoginAt: user.firstAppLoginAt ?? null,
          role: 'user',
        };

      case 'counterboy':
        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          counterboyCode: user.counterboyCode,
          city: user.city,
          state: user.state,
          district: user.district,
          pincode: user.pincode,
          address: user.address,
          totalScans: user.totalScans,
          totalPoints: this.getEffectivePoints(user),
          walletBalance: user.walletBalance ?? 0,
          totalRedemptions: user.totalRedemptions ?? 0,
          tier: user.tier,
          status: user.status,
          kycStatus: user.kycStatus,
          kycRejectionReason: user.kycRejectionReason ?? null,
          bankLinked: user.bankLinked ?? false,
          upiId: user.upiId ?? null,
          bankAccount: user.bankAccount ?? null,
          ifsc: user.ifsc ?? null,
          bankName: user.bankName ?? null,
          accountHolderName: user.accountHolderName ?? null,
          dealerId: user.dealerId,
          dealerName: user.dealer?.name ?? null,
          dealerPhone: user.dealer?.phone ?? null,
          dealerCode: user.dealer?.dealerCode ?? null,
          profileImage: user.profileImage ?? null,
          aadharNumber: user.aadharNumber ?? null,
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          hasPassword: !!user.passwordHash,
          appInstalled: user.appInstalled ?? false,
          firstAppLoginAt: user.firstAppLoginAt ?? null,
          role: 'counterboy',
        };

      default:
        return user;
    }
  }
}
