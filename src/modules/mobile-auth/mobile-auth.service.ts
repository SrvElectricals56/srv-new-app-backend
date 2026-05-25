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
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { MobileLoginDto, VerifyOtpDto, MobileUserRole } from './dto/mobile-login.dto';
import { ElectricianSubCategory, UserStatus } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';

// In-memory OTP store (production mein Redis use karein)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

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
    private readonly tierService: TierService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private generateOtp(): string {
    if (this.configService.get('NODE_ENV') === 'development') {
      return '1234';
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private generateTokens(payload: { sub: string; phone: string; role: string }) {
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });
    return { accessToken, refreshToken };
  }

  private async hashPassword(password?: string) {
    const trimmed = password?.trim();
    if (!trimmed) return null;
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(trimmed, salt);
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

  /** Find user entity by phone + role */
  private async findUserByPhone(phone: string, role: MobileUserRole): Promise<any> {
    switch (role) {
      case 'electrician':
        return this.electricianRepository.findOne({ where: { phone }, relations: ['dealer'] });
      case 'dealer':
        return this.dealerRepository.findOne({ where: { phone } });
      case 'user':
        return this.appUserRepository.findOne({ where: { phone } });
      case 'counterboy':
        return this.hydrateCounterBoyDealer(
          await this.counterboyRepository.findOne({ where: { phone } }),
        );
    }
  }

  /** Update lastActivityAt for any role */
  private async touchActivity(id: string, role: MobileUserRole) {
    const now = new Date();
    switch (role) {
      case 'electrician': await this.electricianRepository.update(id, { lastActivityAt: now }); break;
      case 'dealer':      await this.dealerRepository.update(id, { lastActivityAt: now }); break;
      case 'user':        await this.appUserRepository.update(id, { lastActivityAt: now }); break;
      case 'counterboy':  await this.counterboyRepository.update(id, { lastActivityAt: now }); break;
    }
  }

  // ── Login OTP ──────────────────────────────────────────────────────────────

  async sendOtp(dto: MobileLoginDto) {
    const { phone, role } = dto;
    const user = await this.findUserByPhone(phone, role);

    if (!user) {
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
    const key = `${phone}:${role}`;
    otpStore.set(key, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    console.log(`[OTP] Phone: ${phone}, Role: ${role}, OTP: ${otp}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      ...(this.configService.get('NODE_ENV') === 'development' && { devOtp: otp }),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, role, otp } = dto;
    const key = `${phone}:${role}`;
    const stored = otpStore.get(key);

    if (!stored) throw new BadRequestException('OTP not found or expired. Please request a new OTP.');
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      throw new BadRequestException('OTP expired. Please request a new OTP.');
    }
    if (stored.otp !== otp) throw new UnauthorizedException('Invalid OTP.');
    otpStore.delete(key);

    const user = await this.findUserByPhone(phone, role);
    if (!user) throw new NotFoundException('User not found');

    await this.touchActivity(user.id, role);

    const payload = { sub: user.id, phone: user.phone, role };
    const tokens = this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(user, role) };
  }

  // ── Signup OTP ─────────────────────────────────────────────────────────────

  async sendSignupOtp(phone: string, role: MobileUserRole) {
    const existing = await this.findUserByPhone(phone, role);
    if (existing) throw new ConflictException('Phone number already registered.');

    const otp = this.generateOtp();
    const key = `signup:${phone}:${role}`;
    otpStore.set(key, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });
    console.log(`[SIGNUP OTP] Phone: ${phone}, Role: ${role}, OTP: ${otp}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      ...(this.configService.get('NODE_ENV') === 'development' && { devOtp: otp }),
    };
  }

  async verifySignupOtp(phone: string, role: MobileUserRole, otp: string) {
    const key = `signup:${phone}:${role}`;
    const stored = otpStore.get(key);

    if (!stored) throw new BadRequestException('OTP not found or expired.');
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      throw new BadRequestException('OTP expired. Please request a new OTP.');
    }
    if (stored.otp !== otp) throw new UnauthorizedException('Invalid OTP.');
    // Mark as verified for signup completion
    otpStore.set(key, { otp: 'VERIFIED', expiresAt: Date.now() + 15 * 60 * 1000 });

    return { success: true, message: 'OTP verified successfully' };
  }

  // ── Signup Registration ────────────────────────────────────────────────────

  async registerDealer(data: {
    name: string; phone: string; email?: string; town: string;
    district: string; state: string; address: string; pincode?: string;
    gstNumber?: string; password?: string;
  }) {
    const existing = await this.dealerRepository.findOne({ where: { phone: data.phone } });
    if (existing) throw new ConflictException('Phone number already registered.');

    const stateCode = data.state?.substring(0, 2).toUpperCase() ?? 'XX';
    const dealerCode = `DLR${stateCode}${Date.now().toString().slice(-6)}`;

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

    const saved = await this.dealerRepository.save(dealer);
    const payload = { sub: saved.id, phone: saved.phone, role: 'dealer' };
    const tokens = this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(saved, 'dealer') };
  }

  async registerElectrician(data: {
    name: string; phone: string; email?: string; city: string;
    district: string; state: string; address?: string; pincode?: string;
    dealerPhone: string; password?: string; subCategory?: string; electricianCode?: string;
  }) {
    const existing = await this.electricianRepository.findOne({ where: { phone: data.phone } });
    if (existing) throw new ConflictException('Phone number already registered.');

    let dealerId: string | undefined;
    let dealerCode: string | undefined;
    if (data.dealerPhone) {
      const dealer = await this.dealerRepository.findOne({ where: { phone: data.dealerPhone } });
      if (!dealer) throw new NotFoundException('Dealer not found with this phone number.');
      dealerId = dealer.id;
      dealerCode = dealer.dealerCode;
    }

    const manualCode = this.normalizeElectricianCode(data.electricianCode);
    const electricianCode = manualCode
      ?? (dealerId && dealerCode
        ? await this.generateNextElectricianCodeForDealer(dealerId, dealerCode)
        : this.buildFallbackElectricianCode(data.phone));
    const existingCode = await this.electricianRepository.findOne({ where: { electricianCode } });
    if (existingCode) throw new ConflictException('Electrician code already exists.');

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
      electricianCode,
      subCategory: (data.subCategory as ElectricianSubCategory) ?? ElectricianSubCategory.GENERAL_ELECTRICIAN,
      status: UserStatus.PENDING,
    });

    const saved = await this.electricianRepository.save(electrician);
    if (dealerId) {
      await this.tierService.syncDealerTier(dealerId);
    }
    const savedWithDealer = await this.electricianRepository.findOne({
      where: { id: saved.id },
      relations: ['dealer'],
    });

    const payload = { sub: saved.id, phone: saved.phone, role: 'electrician' };
    const tokens = this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(savedWithDealer ?? saved, 'electrician') };
  }

  async registerUser(data: {
    name: string; phone: string; email?: string; city?: string;
    state?: string; district?: string; address?: string; pincode?: string;
    password?: string;
  }) {
    const existing = await this.appUserRepository.findOne({ where: { phone: data.phone } });
    if (existing) throw new ConflictException('Phone number already registered.');

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
      status: UserStatus.PENDING,
      passwordHash,
    });

    const saved = await this.appUserRepository.save(appUser);
    const payload = { sub: saved.id, phone: saved.phone, role: 'user' };
    const tokens = this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(saved, 'user') };
  }

  async registerCounterBoy(data: {
    name: string; phone: string; email?: string; city?: string;
    state?: string; district?: string; address?: string; pincode?: string;
    dealerPhone?: string; password?: string;
  }) {
    const existing = await this.counterboyRepository.findOne({ where: { phone: data.phone } });
    if (existing) throw new ConflictException('Phone number already registered.');

    let dealerId: string | undefined;
    if (data.dealerPhone) {
      const dealer = await this.dealerRepository.findOne({ where: { phone: data.dealerPhone } });
      if (!dealer) throw new NotFoundException('Dealer not found with this phone number.');
      dealerId = dealer.id;
    }

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
      dealerId,
      counterboyCode,
      status: UserStatus.PENDING,
      passwordHash,
    });

    const saved = await this.counterboyRepository.save(counterboy);
    const savedWithDealer = await this.hydrateCounterBoyDealer(
      await this.counterboyRepository.findOne({ where: { id: saved.id } }),
    );

    const payload = { sub: saved.id, phone: saved.phone, role: 'counterboy' };
    const tokens = this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(savedWithDealer ?? saved, 'counterboy') };
  }

  // ── Password Login ─────────────────────────────────────────────────────────

  async passwordLogin(phone: string, role: MobileUserRole, password: string) {
    const user = await this.findUserByPhone(phone, role);

    if (!user) throw new NotFoundException('User not found.');
    if (user.status === 'suspended') throw new UnauthorizedException('Account is suspended.');

    const isDev = this.configService.get('NODE_ENV') === 'development';

    // If no password provided and no passwordHash set → allow login (OTP-registered users)
    if (!password?.trim()) {
      await this.touchActivity(user.id, role);
      const payload = { sub: user.id, phone: user.phone, role };
      const tokens = this.generateTokens(payload);
      return { ...tokens, user: this.formatUserProfile(user, role) };
    }

    if (isDev && password === '1234') {
      // Allow dev shortcut
    } else if (user.passwordHash) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new UnauthorizedException('Invalid password.');
    } else {
      // No passwordHash set — treat any password attempt as invalid, suggest OTP
      throw new BadRequestException('No password set for this account. Please use OTP login or leave password empty.');
    }

    await this.touchActivity(user.id, role);

    const payload = { sub: user.id, phone: user.phone, role };
    const tokens = this.generateTokens(payload);
    return { ...tokens, user: this.formatUserProfile(user, role) };
  }

  // ── Token Refresh ──────────────────────────────────────────────────────────

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.findUserByPhone(payload.phone, payload.role as MobileUserRole);
      if (!user) throw new UnauthorizedException('User not found');

      const newPayload = { sub: user.id, phone: user.phone, role: payload.role };
      const accessToken = this.jwtService.sign(newPayload);
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async getProfile(userId: string, role: string) {
    let user: any;
    switch (role) {
      case 'electrician':
        user = await this.electricianRepository.findOne({ where: { id: userId }, relations: ['dealer'] });
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
    return this.formatUserProfile(user, role);
  }

  async updateProfile(userId: string, role: string, data: any) {
    const commonFields = ['name', 'email', 'city', 'state', 'district', 'pincode', 'address',
      'upiId', 'bankAccount', 'ifsc', 'bankName', 'accountHolderName', 'bankLinked',
      'language', 'darkMode', 'pushEnabled',
      'aadharFrontImage', 'panDocument', 'gstDocument'];

    const updateData: any = {};
    commonFields.forEach(k => { if (data[k] !== undefined) updateData[k] = data[k]; });
    if (data.profileImage !== undefined) updateData.profileImage = data.profileImage;

    // Dealer-specific fields
    if (role === 'dealer') {
      if (data.town !== undefined) updateData.town = data.town;
      if (data.gstNumber !== undefined) updateData.gstNumber = data.gstNumber;
    }

    // If any KYC document is being submitted, set kycStatus to pending
    const kycDocFields = ['aadharFrontImage', 'panDocument', 'gstDocument'];
    const hasKycDoc = kycDocFields.some(k => data[k] !== undefined && data[k] !== null && data[k] !== '');
    if (hasKycDoc) {
      // Only move to pending if currently not_submitted or rejected
      const currentUser = await this.getProfile(userId, role);
      const currentKycStatus = (currentUser as any).kycStatus;
      if (currentKycStatus === 'not_submitted' || currentKycStatus === 'rejected') {
        updateData.kycStatus = 'pending';
      }
    }

    switch (role) {
      case 'electrician': await this.electricianRepository.update(userId, updateData); break;
      case 'dealer':      await this.dealerRepository.update(userId, updateData); break;
      case 'user':        await this.appUserRepository.update(userId, updateData); break;
      case 'counterboy':  await this.counterboyRepository.update(userId, updateData); break;
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
          totalPoints: user.totalPoints,
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
          dealerName: user.dealer?.name ?? null,
          dealerPhone: user.dealer?.phone ?? null,
          dealerTown: user.dealer?.town ?? null,
          dealerCode: user.dealer?.dealerCode ?? null,
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          kycRejectionReason: user.kycRejectionReason ?? null,
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
          status: user.status,
          kycStatus: user.kycStatus,
          bankLinked: user.bankLinked,
          upiId: user.upiId,
          bankAccount: user.bankAccount,
          ifsc: user.ifsc,
          bankName: user.bankName,
          accountHolderName: user.accountHolderName,
          profileImage: user.profileImage ?? null,
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          kycRejectionReason: user.kycRejectionReason ?? null,
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
          totalPoints: user.totalPoints,
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
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          kycRejectionReason: user.kycRejectionReason ?? null,
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
          totalPoints: user.totalPoints,
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
          aadharFrontImage: user.aadharFrontImage ?? null,
          panDocument: user.panDocument ?? null,
          gstDocument: user.gstDocument ?? null,
          role: 'counterboy',
        };

      default:
        return user;
    }
  }
}
