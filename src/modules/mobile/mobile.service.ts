import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import { Banner } from '../../database/entities/banner.entity';
import { Notification } from '../../database/entities/notification.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Testimonial } from '../../database/entities/testimonial.entity';
import { QrCode } from '../../database/entities/qr-code.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Settings } from '../../database/entities/settings.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { UserRole, ScanMode, TransactionType, TransactionSource, SupportTicketStatus, SupportTicketPriority } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';

@Injectable()
export class MobileService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Banner)
    private bannerRepository: Repository<Banner>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(Offer)
    private offerRepository: Repository<Offer>,
    @InjectRepository(Testimonial)
    private testimonialRepository: Repository<Testimonial>,
    @InjectRepository(QrCode)
    private qrCodeRepository: Repository<QrCode>,
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
    @InjectRepository(Redemption)
    private redemptionRepository: Repository<Redemption>,
    @InjectRepository(Settings)
    private settingsRepository: Repository<Settings>,
    @InjectRepository(SupportTicket)
    private supportTicketRepository: Repository<SupportTicket>,
    private readonly tierService: TierService,
  ) {}

  private normalizeRole(role: string): UserRole {
    switch (role) {
      case UserRole.ELECTRICIAN:
      case UserRole.DEALER:
      case UserRole.USER:
      case UserRole.COUNTERBOY:
        return role;
      default:
        return UserRole.DEALER;
    }
  }

  private async getUserByRole(userId: string, role: string) {
    switch (this.normalizeRole(role)) {
      case UserRole.ELECTRICIAN:
        return this.electricianRepository.findOne({ where: { id: userId } });
      case UserRole.DEALER:
        return this.dealerRepository.findOne({ where: { id: userId } });
      case UserRole.USER:
        return this.appUserRepository.findOne({ where: { id: userId } });
      case UserRole.COUNTERBOY:
        return this.counterBoyRepository.findOne({ where: { id: userId } });
    }
  }

  private async updateUserByRole(userId: string, role: string, data: Record<string, any>) {
    switch (this.normalizeRole(role)) {
      case UserRole.ELECTRICIAN:
        return this.electricianRepository.update(userId, data);
      case UserRole.DEALER:
        return this.dealerRepository.update(userId, data);
      case UserRole.USER:
        return this.appUserRepository.update(userId, data);
      case UserRole.COUNTERBOY:
        return this.counterBoyRepository.update(userId, data);
    }
  }

  private async findReceiverByPhone(phone: string) {
    const electrician = await this.electricianRepository.findOne({ where: { phone } });
    if (electrician) return { user: electrician, role: UserRole.ELECTRICIAN };

    const dealer = await this.dealerRepository.findOne({ where: { phone } });
    if (dealer) return { user: dealer, role: UserRole.DEALER };

    const appUser = await this.appUserRepository.findOne({ where: { phone } });
    if (appUser) return { user: appUser, role: UserRole.USER };

    const counterBoy = await this.counterBoyRepository.findOne({ where: { phone } });
    if (counterBoy) return { user: counterBoy, role: UserRole.COUNTERBOY };

    return null;
  }

  private getReferralCode(user: any, role: UserRole, userId: string) {
    if (role === UserRole.ELECTRICIAN) return user?.electricianCode ?? userId.slice(0, 8).toUpperCase();
    if (role === UserRole.DEALER) return user?.dealerCode ?? userId.slice(0, 8).toUpperCase();
    if (role === UserRole.USER) return user?.userCode ?? userId.slice(0, 8).toUpperCase();
    return user?.counterboyCode ?? userId.slice(0, 8).toUpperCase();
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async getProducts(category?: string) {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.category != :gift', { gift: 'gift' });

    if (category) {
      qb.andWhere('product.category = :category', { category });
    }

    qb.orderBy('product.createdAt', 'DESC');
    const products = await qb.getMany();
    return { data: products };
  }

  async getProductCategories() {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .select('DISTINCT product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.category != :gift', { gift: 'gift' })
      .getRawMany();

    const categories = products.map((p, i) => ({
      id: `cat_${i}`,
      label: p.category,
      slug: p.category.toLowerCase().replace(/\s+/g, '-'),
      glyph: null,
      imageUrl: null,
    }));

    return { data: categories };
  }

  async getProductById(id: string) {
    const product = await this.productRepository.findOne({
      where: { id, isActive: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // ── Banners ────────────────────────────────────────────────────────────────

  async getBanners(role?: string) {
    const banners = await this.bannerRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', order: 'ASC' },
    });
    return { data: banners };
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  async getNotifications(userId?: string, role?: string) {
    const qb = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.status = :status', { status: 'sent' });

    if (role) {
      qb.andWhere('(notification.targetRole IS NULL OR notification.targetRole = :role OR notification.targetRole = :all)', {
        role,
        all: 'all',
      });
    }

    qb.orderBy('notification.sentAt', 'DESC').take(50);
    const notifications = await qb.getMany();
    return { data: notifications };
  }

  async deleteNotification(id: string) {
    const notification = await this.notificationRepository.findOne({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    await this.notificationRepository.remove(notification);
    return { message: 'Notification deleted successfully' };
  }

  // ── Settings / Maintenance ─────────────────────────────────────────────────

  async getMaintenanceMode() {
    const setting = await this.settingsRepository.findOne({
      where: { key: 'maintenanceMode' },
    });
    return {
      maintenanceMode: setting?.value === 'true',
      message: setting?.value === 'true' ? 'App is under maintenance' : 'All systems operational',
    };
  }

  async getAppSettings() {
    const rows = await this.settingsRepository.find({ order: { key: 'ASC' } });
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return {
      maintenanceMode: map['maintenanceMode'] === 'true',
      maintenanceMessage: map['maintenanceMessage'] ?? 'App is under maintenance. Please try again later.',
      supportPhone: map['supportPhone'] ?? '+91 88376 84004',
      supportEmail: map['supportEmail'] ?? 'support@srvelectricals.com',
      whatsappNumber: map['whatsappNumber'] ?? '918837684004',
      appVersion: map['appVersion'] ?? '1.0.0',
      minAppVersion: map['minAppVersion'] ?? '1.0.0',
      forceUpdate: map['forceUpdate'] === 'true',
      scanEnabled: map['scanEnabled'] !== 'false',
      giftsEnabled: map['giftsEnabled'] !== 'false',
      referralEnabled: map['referralEnabled'] !== 'false',
      playStoreUrl: map['playStoreUrl'] ?? 'https://play.google.com/store/apps/details?id=com.srvelectricals.app',
      appStoreUrl: map['appStoreUrl'] ?? '',
      catalogPdfUrl: map['catalogPdfUrl'] ?? null,
    };
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  async getOffers(role?: string) {
    const today = new Date();
    const qb = this.offerRepository
      .createQueryBuilder('offer')
      .where('offer.status = :status', { status: 'active' })
      .andWhere('offer.validFrom <= :today', { today })
      .andWhere('offer.validTo >= :today', { today });

    if (role) {
      qb.andWhere('(offer.targetRole IS NULL OR offer.targetRole = :role OR offer.targetRole = :all)', {
        role,
        all: 'all',
      });
    }

    qb.orderBy('offer.createdAt', 'DESC');
    const offers = await qb.getMany();
    return { data: offers };
  }

  // ── Testimonials ───────────────────────────────────────────────────────────

  async getTestimonials() {
    // Only return active testimonials — when admin deletes/deactivates, app reflects it
    const testimonials = await this.testimonialRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
    return { data: testimonials };
  }

  // ── Gift Products ──────────────────────────────────────────────────────────

  async getGiftProducts(role?: string) {
    const qb = this.productRepository
      .createQueryBuilder('p')
      .where('p.category = :cat', { cat: 'gift' })
      .andWhere('p.isActive = :active', { active: true })
      .andWhere('p.stock > 0');

    if (role) {
      qb.andWhere('(p.subCategory IS NULL OR p.subCategory = :role OR p.subCategory = :all)', {
        role,
        all: 'all',
      });
    }

    qb.orderBy('p.createdAt', 'DESC');
    const products = await qb.getMany();

    return {
      data: products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        imageUrl: p.image ?? null,
        pointsRequired: p.points ?? 0,
        mrp: p.mrp ?? 0,
        stock: p.stock ?? 0,
        badge: p.badge ?? '',
        targetRole: p.subCategory ?? 'all',
      })),
    };
  }

  // ── Reward Schemes ─────────────────────────────────────────────────────────

  async getRewardSchemes(category?: string) {
    // Reward schemes are gift products mapped to scheme format
    const qb = this.productRepository
      .createQueryBuilder('p')
      .where('p.category = :cat', { cat: 'gift' })
      .andWhere('p.isActive = :active', { active: true });

    if (category) {
      qb.andWhere('p.subCategory = :category', { category });
    }

    qb.orderBy('p.points', 'ASC');
    const products = await qb.getMany();

    return {
      data: products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        pointsCost: p.points ?? 0,
        category: p.subCategory ?? 'general',
        imageUrl: p.image ?? null,
        mrp: p.mrp ?? null,
        active: p.isActive,
      })),
    };
  }

  // ── Festival Theme ─────────────────────────────────────────────────────────

  async getFestivalTheme() {
    // Check settings for active festival
    const rows = await this.settingsRepository.find({ order: { key: 'ASC' } });
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });

    const now = new Date();
    return {
      active: false,
      source: 'settings',
      timezone: 'Asia/Kolkata',
      currentDate: now.toISOString().split('T')[0],
      serverTime: now.toISOString(),
      id: null,
      name: null,
      slug: null,
      greeting: null,
      subGreeting: null,
      emoji: null,
      bannerEmojis: '🎉✨🎊',
      particleEmojis: '⭐✨💫',
      theme: {
        primaryColor: map['festivalPrimaryColor'] ?? '#FF6B35',
        secondaryColor: map['festivalSecondaryColor'] ?? '#F7C59F',
        accentColor: map['festivalAccentColor'] ?? '#EFEFD0',
        bgColor: map['festivalBgColor'] ?? '#004E89',
        cardColor: map['festivalCardColor'] ?? '#1A936F',
        textColor: map['festivalTextColor'] ?? '#FFFFFF',
      },
      startDate: null,
      endDate: null,
    };
  }

  // ── Dealer Lookup ──────────────────────────────────────────────────────────

  async getDealerByPhone(phone: string) {
    if (!phone) throw new BadRequestException('Phone number is required');
    const dealer = await this.dealerRepository.findOne({ where: { phone } });
    if (!dealer) throw new NotFoundException('Dealer not found');
    return {
      id: dealer.id,
      name: dealer.name,
      phone: dealer.phone,
      dealerCode: dealer.dealerCode,
      town: dealer.town,
      district: dealer.district,
      state: dealer.state,
    };
  }

  // ── Scan ───────────────────────────────────────────────────────────────────

  async submitScan(userId: string, role: string, qrCode: string, mode: 'single' | 'multi') {
    const qr = await this.qrCodeRepository.findOne({
      where: { code: qrCode, isActive: true },
      relations: ['product'],
    });

    if (!qr) throw new NotFoundException('QR code not found or invalid');
    if (!qr.product || !qr.product.isActive) throw new BadRequestException('Product is not active');

    const existingScan = await this.scanRepository.findOne({
      where: { userId, qrCodeId: qr.id },
    });
    if (existingScan) throw new ConflictException('This QR code has already been scanned by you');

    const points = qr.product.points;
    const userRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, role);
    const userName = user?.name ?? 'Unknown';

    const scan = this.scanRepository.create({
      userId,
      userName,
      role: userRole,
      productId: qr.product.id,
      productName: qr.product.name,
      points,
      mode: mode === 'multi' ? ScanMode.MULTI : ScanMode.SINGLE,
      qrCodeId: qr.id,
    });
    await this.scanRepository.save(scan);

    await this.qrCodeRepository.update(qr.id, {
      isScanned: true,
      scanCount: (qr.scanCount ?? 0) + 1,
      lastScannedBy: userId,
      lastScannedAt: new Date(),
    });

    await this.productRepository.update(qr.product.id, {
      totalScanned: (qr.product.totalScanned ?? 0) + 1,
    });

    if (user) {
      const userRecord = user as any;
      const newPoints = (userRecord.totalPoints ?? 0) + points;
      const newScans = (userRecord.totalScans ?? 0) + 1;
      const newWallet = (userRecord.walletBalance ?? 0) + points;
      const updateData: Record<string, any> = {
        totalPoints: newPoints,
        totalScans: newScans,
        walletBalance: newWallet,
        lastActivityAt: new Date(),
      };

      if (userRole === UserRole.ELECTRICIAN || userRole === UserRole.COUNTERBOY || userRole === UserRole.USER) {
        updateData.tier = this.tierService.calculateElectricianTier(newPoints) as any;
      }

      await this.updateUserByRole(userId, role, updateData);

      const walletTx = this.walletRepository.create({
        userId,
        userRole,
        type: 'credit' as any,
        source: 'scan' as any,
        amount: points,
        balanceBefore: userRecord.walletBalance ?? 0,
        balanceAfter: newWallet,
        description: `Scan: ${qr.product.name}`,
        referenceId: scan.id,
        referenceType: 'scan',
      });
      await this.walletRepository.save(walletTx);
    }

    return {
      success: true,
      scan: {
        id: scan.id,
        productName: qr.product.name,
        points,
        mode,
        scannedAt: scan.scannedAt,
      },
      pointsEarned: points,
    };
  }

  async getScanHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [scans, total] = await this.scanRepository.findAndCount({
      where: { userId },
      order: { scannedAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data: scans, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  async getWallet(userId: string, role: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const normalizedRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, role);

    const [transactions, total] = await this.walletRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      balance: (user as any)?.walletBalance ?? 0,
      totalPoints: normalizedRole === UserRole.DEALER ? 0 : ((user as any)?.totalPoints ?? 0),
      totalScans: (user as any)?.totalScans ?? 0,
      transactions: {
        data: transactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async saveBankAccount(userId: string, role: string, data: {
    accountHolderName: string; bankName: string; accountNumber: string; ifsc: string; upiId?: string;
  }) {
    const updateData: any = {
      accountHolderName: data.accountHolderName,
      bankName: data.bankName,
      bankAccount: data.accountNumber,
      ifsc: data.ifsc,
      bankLinked: true,
    };
    if (data.upiId) updateData.upiId = data.upiId;

    await this.updateUserByRole(userId, role, updateData);
    return { message: 'Bank account saved successfully' };
  }

  async redeemReward(userId: string, role: string, data: { schemeId: string; note?: string }) {
    // Find the gift product (reward scheme)
    const product = await this.productRepository.findOne({
      where: { id: data.schemeId, category: 'gift', isActive: true },
    });
    if (!product) throw new NotFoundException('Reward scheme not found');

    const normalizedRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, role);
    if (!user) throw new NotFoundException('User not found');

    const pointsRequired = product.points ?? 0;
    if ((user.walletBalance ?? 0) < pointsRequired) {
      throw new BadRequestException('Insufficient points for this redemption');
    }

    const redemption = this.redemptionRepository.create({
      userId,
      userName: user.name,
      role: normalizedRole,
      type: 'gift',
      points: pointsRequired,
      amount: product.mrp ?? 0,
      status: 'pending' as any,
      upiId: user.upiId,
      bankAccount: user.bankAccount,
      ifsc: user.ifsc,
      accountHolderName: user.accountHolderName,
    });
    await this.redemptionRepository.save(redemption);

    return { message: 'Redemption request submitted successfully', redemptionId: redemption.id };
  }

  async transferPoints(userId: string, role: string, data: { receiverPhone: string; points: number }) {
    const normalizedRole = this.normalizeRole(role);
    const sender = await this.getUserByRole(userId, role);
    if (!sender) throw new NotFoundException('Sender not found');
    if ((sender.walletBalance ?? 0) < data.points) {
      throw new BadRequestException('Insufficient balance');
    }

    const receiverData = await this.findReceiverByPhone(data.receiverPhone);
    if (!receiverData) throw new NotFoundException('Receiver not found');
    const receiver = receiverData.user;

    // Deduct from sender
    const senderNewBalance = (sender.walletBalance ?? 0) - data.points;
    await this.updateUserByRole(userId, role, { walletBalance: senderNewBalance });

    const receiverNewBalance = (receiver.walletBalance ?? 0) + data.points;
    await this.updateUserByRole(receiver.id, receiverData.role, { walletBalance: receiverNewBalance });

    // Log transactions
    await this.walletRepository.save(this.walletRepository.create({
      userId,
      userRole: normalizedRole,
      type: TransactionType.DEBIT,
      source: TransactionSource.TRANSFER,
      amount: data.points,
      balanceBefore: sender.walletBalance ?? 0,
      balanceAfter: senderNewBalance,
      description: `Transfer to ${receiver.name} (${data.receiverPhone})`,
      referenceId: receiver.id,
      referenceType: 'transfer',
    }));

    return { message: 'Points transferred successfully' };
  }

  async getDealerBonus(dealerId: string) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new NotFoundException('Dealer not found');

    const bonusAmount = Math.max(0, ((dealer.achievedTarget ?? 0) as number) - ((dealer.monthlyTarget ?? 0) as number)) * 0.1;

    return {
      availableBonus: bonusAmount,
      totalBonus: bonusAmount,
      pendingWithdrawals: 0,
      achievedTarget: dealer.achievedTarget ?? 0,
      monthlyTarget: dealer.monthlyTarget ?? 0,
      bonusStatus: (dealer as any).bonusStatus ?? 'pending',
    };
  }

  async requestDealerBonusWithdrawal(dealerId: string, data: { amount: number }) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new NotFoundException('Dealer not found');

    const redemption = this.redemptionRepository.create({
      userId: dealerId,
      userName: dealer.name,
      role: UserRole.DEALER,
      type: 'bonus_withdrawal',
      points: 0,
      amount: data.amount,
      status: 'pending' as any,
      upiId: dealer.upiId,
      bankAccount: dealer.bankAccount,
      ifsc: dealer.ifsc,
      accountHolderName: dealer.accountHolderName,
    });
    await this.redemptionRepository.save(redemption);

    return { message: 'Withdrawal request submitted successfully' };
  }

  async getRedemptionHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.redemptionRepository.findAndCount({
      where: { userId },
      order: { requestedAt: 'DESC' },
      skip,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Electricians (for dealer) ──────────────────────────────────────────────

  async getDealerElectricians(dealerId: string, page: number = 1, limit: number = 50, search?: string) {
    const skip = (page - 1) * limit;
    const qb = this.electricianRepository
      .createQueryBuilder('electrician')
      .where('electrician.dealerId = :dealerId', { dealerId });

    if (search) {
      qb.andWhere(
        '(electrician.name ILIKE :search OR electrician.phone ILIKE :search OR electrician.city ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    qb.orderBy('electrician.joinedDate', 'DESC').skip(skip).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDealerElectriciansCallList(dealerId: string) {
    const electricians = await this.electricianRepository.find({
      where: { dealerId },
      select: ['id', 'name', 'phone', 'city', 'status'],
      order: { name: 'ASC' },
    });

    return {
      data: electricians.map(e => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        whatsapp: e.phone,
        city: e.city,
        status: e.status,
      })),
    };
  }

  async addElectrician(dealerId: string, body: any) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new NotFoundException('Dealer not found');

    const existing = await this.electricianRepository.findOne({ where: { phone: body.phone } });
    if (existing) {
      if (existing.dealerId === dealerId) {
        return { message: 'Electrician already in your network', electrician: existing };
      }
      const oldDealerId = existing.dealerId;
      await this.electricianRepository.update(existing.id, { dealerId });
      if (oldDealerId) await this.tierService.syncDealerTier(oldDealerId);
      await this.tierService.syncDealerTier(dealerId);
      return { message: 'Electrician linked to your network', electrician: existing };
    }

    const code = `${dealer.state?.substring(0, 2).toUpperCase() ?? 'XX'}${Date.now().toString().slice(-6)}`;
    const electrician = this.electricianRepository.create({
      name: body.name,
      phone: body.phone,
      electricianCode: code,
      city: body.city ?? dealer.town,
      state: body.state ?? dealer.state,
      district: body.district ?? dealer.district,
      dealerId,
      status: 'active' as any,
    });

    const saved = await this.electricianRepository.save(electrician);
    await this.tierService.syncDealerTier(dealerId);
    return { message: 'Electrician added successfully', electrician: saved };
  }

  // ── Support ────────────────────────────────────────────────────────────────

  async createSupportTicket(userId: string, role: string, data: {
    subject: string; comment: string; photoUrl?: string;
  }) {
    const user = await this.getUserByRole(userId, role);
    const userRole = this.normalizeRole(role);
    const ticket = this.supportTicketRepository.create({
      userId,
      userName: user?.name ?? 'Unknown',
      userRole,
      subject: data.subject,
      message: data.comment,
      status: SupportTicketStatus.OPEN,
      priority: SupportTicketPriority.MEDIUM,
    });

    await this.supportTicketRepository.save(ticket);
    return { message: 'Support ticket created successfully', ticketId: ticket.id };
  }

  // ── Referral ───────────────────────────────────────────────────────────────

  async getReferral(userId: string, role: string) {
    const normalizedRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, role);
    const code = this.getReferralCode(user, normalizedRole, userId);

    return {
      code,
      link: null,
      channels: ['whatsapp', 'sms', 'copy'],
    };
  }

  // ── Rating ─────────────────────────────────────────────────────────────────

  // In-memory rating store (production mein DB table use karein)
  private ratingStore = new Map<string, { id: string; rating: number; review: string | null }>();

  async submitRating(userId: string, rating: number, review?: string) {
    const id = `rating_${userId}`;
    const record = { id, rating, review: review ?? null };
    this.ratingStore.set(userId, record);
    return record;
  }

  async getRating(userId: string) {
    return this.ratingStore.get(userId) ?? null;
  }
}
