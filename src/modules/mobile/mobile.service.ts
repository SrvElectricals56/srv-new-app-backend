import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
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
import { GiftOrder, GiftOrderStatus } from '../../database/entities/gift-order.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { UserRole, ScanMode, TransactionType, TransactionSource, SupportTicketStatus, SupportTicketPriority } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';

@Injectable()
export class MobileService {
  private persistenceSetupPromise: Promise<void> | null = null;

  constructor(
    private dataSource: DataSource,
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
    @InjectRepository(GiftOrder)
    private giftOrderRepository: Repository<GiftOrder>,
    @InjectRepository(ProductCategory)
    private productCategoryRepository: Repository<ProductCategory>,
    private readonly tierService: TierService,
  ) {}

  private async ensurePersistenceArtifacts() {
    if (!this.persistenceSetupPromise) {
      this.persistenceSetupPromise = this.dataSource.query(`
        ALTER TABLE "support_tickets"
        ADD COLUMN IF NOT EXISTS "photoUrl" text;
      `).then(async () => {
        await this.dataSource.query(`
          CREATE TABLE IF NOT EXISTS "app_ratings" (
            "userId" varchar(255) PRIMARY KEY,
            "userRole" varchar(50) NOT NULL,
            "rating" integer NOT NULL,
            "review" text NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
          );
        `);
      }).catch((error) => {
        this.persistenceSetupPromise = null;
        throw error;
      });
    }

    await this.persistenceSetupPromise;
  }

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

  private getUserRepositoryByRole(role: string, manager?: EntityManager) {
    switch (this.normalizeRole(role)) {
      case UserRole.ELECTRICIAN:
        return manager
          ? manager.getRepository(Electrician)
          : this.electricianRepository;
      case UserRole.DEALER:
        return manager ? manager.getRepository(Dealer) : this.dealerRepository;
      case UserRole.USER:
        return manager
          ? manager.getRepository(AppUser)
          : this.appUserRepository;
      case UserRole.COUNTERBOY:
        return manager
          ? manager.getRepository(CounterBoy)
          : this.counterBoyRepository;
    }
  }

  private async getUserByRole(
    userId: string,
    role: string,
    manager?: EntityManager,
  ) {
    return this.getUserRepositoryByRole(role, manager).findOne({
      where: { id: userId } as any,
    });
  }

  private async getUserByRoleForUpdate(
    userId: string,
    role: string,
    manager: EntityManager,
  ) {
    return this.getUserRepositoryByRole(role, manager)
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.name',
        'user.phone',
        'user.walletBalance',
        'user.totalPoints',
        'user.tier',
        'user.dealerId',
        'user.status',
        'user.bankLinked',
        'user.upiId',
        'user.bankAccount',
        'user.ifsc',
        'user.bankName',
        'user.accountHolderName',
      ])
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  private async updateUserByRole(
    userId: string,
    role: string,
    data: Record<string, any>,
    manager?: EntityManager,
  ) {
    return this.getUserRepositoryByRole(role, manager).update(userId, data);
  }

  private normalizePhone(phone: string): string {
    return String(phone ?? '').replace(/\D/g, '').slice(-10);
  }

  private async findRecordByPhone(
    repository: Repository<any>,
    alias: string,
    phone: string,
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      return null;
    }

    return repository
      .createQueryBuilder(alias)
      .select([
        `${alias}.id`,
        `${alias}.name`,
        `${alias}.phone`,
        `${alias}.walletBalance`,
        `${alias}.totalPoints`,
        `${alias}.tier`,
        `${alias}.dealerId`,
        `${alias}.status`,
      ])
      .where(`${alias}.phone = :normalizedPhone`, { normalizedPhone })
      .orWhere(
        `regexp_replace(regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g'), '^0+', '') = regexp_replace(:normalizedPhone, '^0+', '')`,
        { normalizedPhone },
      )
      .getOne();
  }

  private buildTransferBalanceUpdate(
    _user: any,
    role: UserRole,
    newBalance: number,
    _pointsDelta: number,
  ) {
    const updateData: Record<string, any> = {
      walletBalance: newBalance,
    };

    if (role !== UserRole.DEALER) {
      const syncedPoints = Math.max(0, Number(newBalance ?? 0));
      updateData.totalPoints = syncedPoints;

      if (role === UserRole.ELECTRICIAN) {
        updateData.tier = this.tierService.calculateElectricianTier(syncedPoints);
      }
    }

    return updateData;
  }

  private async findReceiverByPhone(phone: string, manager?: EntityManager) {
    const electrician = await this.findRecordByPhone(
      manager ? manager.getRepository(Electrician) : this.electricianRepository,
      'electrician',
      phone,
    );
    if (electrician) return { user: electrician, role: UserRole.ELECTRICIAN };

    const dealer = await this.findRecordByPhone(
      manager ? manager.getRepository(Dealer) : this.dealerRepository,
      'dealer',
      phone,
    );
    if (dealer) return { user: dealer, role: UserRole.DEALER };

    const appUser = await this.findRecordByPhone(
      manager ? manager.getRepository(AppUser) : this.appUserRepository,
      'appUser',
      phone,
    );
    if (appUser) return { user: appUser, role: UserRole.USER };

    const counterBoy = await this.findRecordByPhone(
      manager ? manager.getRepository(CounterBoy) : this.counterBoyRepository,
      'counterBoy',
      phone,
    );
    if (counterBoy) return { user: counterBoy, role: UserRole.COUNTERBOY };

    return null;
  }

  async lookupTransferRecipient(
    phone: string,
    currentUserId?: string,
    currentRole?: string,
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      throw new BadRequestException('Phone number must be 10 digits');
    }

    const receiverData = await this.findReceiverByPhone(normalizedPhone);
    if (!receiverData) {
      throw new NotFoundException('User not found');
    }

    if (
      currentUserId &&
      currentRole &&
      receiverData.user.id === currentUserId &&
      receiverData.role === this.normalizeRole(currentRole)
    ) {
      throw new BadRequestException('You cannot transfer points to yourself');
    }

    return {
      id: receiverData.user.id,
      name: (receiverData.user as any).name,
      phone: this.normalizePhone((receiverData.user as any).phone),
      role: receiverData.role,
    };
  }

  private async getWalletSummary(
    userId: string,
    role: string,
    manager?: EntityManager,
  ) {
    const normalizedRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, role, manager);
    const walletRepo = manager
      ? manager.getRepository(Wallet)
      : this.walletRepository;

    const totals = await walletRepo
      .createQueryBuilder('wallet')
      .select(
        `COALESCE(SUM(CASE WHEN wallet.type = :credit THEN wallet.amount ELSE 0 END), 0)`,
        'totalEarned',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN wallet.type = :debit THEN wallet.amount ELSE 0 END), 0)`,
        'totalRedeemed',
      )
      .where('wallet.userId = :userId', { userId })
      .setParameters({
        credit: TransactionType.CREDIT,
        debit: TransactionType.DEBIT,
      })
      .getRawOne();

    const balance = Number((user as any)?.walletBalance ?? 0);
    const effectivePoints = normalizedRole === UserRole.DEALER ? 0 : balance;

    return {
      balance,
      wallet: balance,
      wallet_balance: balance,
      walletbalance: balance,
      currentwallet: balance,
      totalwallet_amount: balance,
      totalearnedwallet_amount: Number(totals?.totalEarned ?? 0),
      totalredeemedwallet_amount: Number(totals?.totalRedeemed ?? 0),
      totalPoints: effectivePoints,
      totalScans: Number((user as any)?.totalScans ?? 0),
    };
  }

  private getReferralCode(user: any, role: UserRole, userId: string) {
    if (role === UserRole.ELECTRICIAN) return user?.electricianCode ?? userId.slice(0, 8).toUpperCase();
    if (role === UserRole.DEALER) return user?.dealerCode ?? userId.slice(0, 8).toUpperCase();
    if (role === UserRole.USER) return user?.userCode ?? userId.slice(0, 8).toUpperCase();
    return user?.counterboyCode ?? userId.slice(0, 8).toUpperCase();
  }

  private normalizeElectricianCode(code?: string | null): string | null {
    const trimmed = code?.trim();
    if (!trimmed || trimmed.includes('###')) {
      return null;
    }

    return trimmed.toUpperCase();
  }

  private async getNextElectricianSerial(dealerId: string, dealerCode: string): Promise<number> {
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

    return maxSerial + 1;
  }

  private async generateNextElectricianCodeForDealer(dealerId: string, dealerCode: string): Promise<string> {
    const nextSerial = await this.getNextElectricianSerial(dealerId, dealerCode);
    return `${dealerCode.trim().toUpperCase()}-${String(nextSerial).padStart(3, '0')}`;
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
    
    // Transform products to include imageUrl field and handle null/empty images
    const transformedProducts = products.map(product => {
      // If image is null, empty, or just whitespace, set it to null so app can use fallback
      const imageValue = product.image?.trim() || null;
      
      return {
        ...product,
        image: imageValue,
        imageUrl: imageValue, // Add imageUrl field that points to image
      };
    });
    
    return { data: transformedProducts };
  }

  async getProductCategories() {
    const adminCategories = await this.productCategoryRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const products = await this.productRepository
      .createQueryBuilder('product')
      .select('DISTINCT product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.category != :gift', { gift: 'gift' })
      .getRawMany();

    const normalizeSlug = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

    const categories = new Map<string, { id: string; label: string; slug: string; glyph: string | null; imageUrl: string | null }>();

    for (const category of adminCategories) {
      const slug = normalizeSlug(category.label);
      categories.set(slug, {
        id: category.id,
        label: category.label,
        slug,
        glyph: category.glyph ?? null,
        imageUrl: category.imageUrl ?? null,
      });
    }

    for (const product of products) {
      const label = product.category?.trim();
      if (!label) continue;
      const slug = normalizeSlug(label);
      if (categories.has(slug)) continue;
      categories.set(slug, {
        id: `cat_${categories.size}`,
        label,
        slug,
        glyph: null,
        imageUrl: null,
      });
    }

    return { data: Array.from(categories.values()) };
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
    const allBanners = await this.bannerRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', order: 'ASC' },
    });

    // Normalize role for matching (backend uses lowercase: 'user', 'counterboy')
    // Admin panel uses: 'Customer', 'CounterBoy', 'All', 'Electrician', 'Dealer'
    const roleAliasMap: Record<string, string[]> = {
      user:        ['Customer', 'customer', 'user', 'All', 'Both'],
      counterboy:  ['CounterBoy', 'counterboy', 'All', 'Both'],
      electrician: ['Electrician', 'electrician', 'All', 'Both'],
      dealer:      ['Dealer', 'dealer', 'All', 'Both'],
    };
    const matchValues = role ? (roleAliasMap[role] ?? [role, 'All', 'Both']) : [];

    const filtered = allBanners.filter((banner) => {
      // Must be active status
      if (banner.status && banner.status !== 'active') return false;
      // Must have imageUrl
      if (!banner.imageUrl) return false;
      // If no targetRole set → show to everyone
      if (!banner.targetRole || banner.targetRole.length === 0) return true;
      // 'All' or 'Both' in targetRole → show to everyone
      if (banner.targetRole.includes('All') || banner.targetRole.includes('Both')) return true;
      // If role provided, check if any alias matches
      if (role && matchValues.length > 0) {
        return banner.targetRole.some(r => matchValues.includes(r));
      }
      return false;
    });

    return { data: filtered };
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  private normalizeNotificationTargetRole(targetRole?: string | null): UserRole | 'all' | null {
    const normalized = String(targetRole ?? '').trim().toLowerCase();

    if (!normalized || normalized === 'all' || normalized === 'all users') {
      return 'all';
    }

    const roleMap: Record<string, UserRole> = {
      electrician: UserRole.ELECTRICIAN,
      'only electricians': UserRole.ELECTRICIAN,
      dealer: UserRole.DEALER,
      'only dealers': UserRole.DEALER,
      user: UserRole.USER,
      customer: UserRole.USER,
      'only customers': UserRole.USER,
      counterboy: UserRole.COUNTERBOY,
      counterboys: UserRole.COUNTERBOY,
      'only counterboys': UserRole.COUNTERBOY,
    };

    return roleMap[normalized] ?? null;
  }

  async getNotifications(userId?: string, role?: string) {
    const notifications = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.status = :status', { status: 'sent' })
      .orderBy('notification.sentAt', 'DESC', 'NULLS LAST')
      .addOrderBy('notification.createdAt', 'DESC')
      .take(50)
      .getMany();

    const normalizedRole = role ? this.normalizeRole(role) : null;
    const filteredNotifications = notifications.filter((notification) => {
      const targetUserIds = Array.isArray(notification.targetUserIds)
        ? notification.targetUserIds.filter(Boolean)
        : [];

      if (targetUserIds.length > 0) {
        return !!userId && targetUserIds.includes(userId);
      }

      const targetRole = this.normalizeNotificationTargetRole(notification.targetRole);
      if (targetRole === 'all') {
        return true;
      }

      if (!targetRole || !normalizedRole) {
        return false;
      }

      return targetRole === normalizedRole;
    });

    return { data: filteredNotifications };
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
    let rolePageControls: Record<string, Record<string, boolean>> | null = null;
    let appPageContent: Record<string, Record<string, Record<string, string>>> | null = null;
    let pageSectionOrder: Record<string, Record<string, string[]>> | null = null;
    if (map['rolePageControls']) {
      try {
        rolePageControls = JSON.parse(map['rolePageControls']);
      } catch {
        rolePageControls = null;
      }
    }
    if (map['appPageContent']) {
      try {
        appPageContent = JSON.parse(map['appPageContent']);
      } catch {
        appPageContent = null;
      }
    }
    if (map['pageSectionOrder']) {
      try {
        pageSectionOrder = JSON.parse(map['pageSectionOrder']);
      } catch {
        pageSectionOrder = null;
      }
    }
    return {
      maintenanceMode: map['maintenanceMode'] === 'true',
      maintenanceMessage: map['maintenanceMessage'] ?? 'App is under maintenance. Please try again later.',
      supportPhone: map['supportPhone'] ?? '+91 88376 84004',
      supportEmail: map['supportEmail'] ?? 'info@srvelectricals.com',
      whatsappNumber: map['whatsappNumber'] ?? '918837684004',
      appVersion: map['appVersion'] ?? '1.0.0',
      minAppVersion: map['minAppVersion'] ?? '1.0.0',
      forceUpdate: map['forceUpdate'] === 'true',
      scanEnabled: map['scanEnabled'] !== 'false',
      giftsEnabled: map['giftsEnabled'] !== 'false',
      referralEnabled: map['referralEnabled'] !== 'false',
      testimonialsEnabled: map['testimonialsEnabled'] !== 'false',
      playEnabled: map['playEnabled'] !== 'false',
      dealerCanAddElectrician: map['dealerCanAddElectrician'] !== 'false',
      playStoreUrl: map['playStoreUrl'] ?? 'https://play.google.com/store/apps/details?id=com.srvelectricals.app',
      appStoreUrl: map['appStoreUrl'] ?? '',
      generalCatalogPdfUrl: map['generalCatalogPdfUrl'] ?? map['catalogPdfUrl'] ?? null,
      dealerCatalogPdfUrl: map['dealerCatalogPdfUrl'] ?? null,
      catalogPdfUrl: map['generalCatalogPdfUrl'] ?? map['catalogPdfUrl'] ?? null,
      rolePageControls,
      appPageContent,
      pageSectionOrder,
      privacyPolicyContent: map['privacy_policy_content'] ?? null,
      privacyPolicyUpdated: map['privacy_policy_updated'] ?? null,
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
      // 'user' role in app = 'customer' in admin panel — treat as aliases
      const normalizedRole = role === 'user' ? 'customer' : role;
      qb.andWhere(
        '(p.subCategory IS NULL OR p.subCategory = :role OR p.subCategory = :alias OR p.subCategory = :all)',
        { role: normalizedRole, alias: role, all: 'all' },
      );
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
      // 'user' role in app = 'customer' in admin panel — treat as aliases
      const normalizedCategory = category === 'user' ? 'customer' : category;
      qb.andWhere('(p.subCategory = :category OR p.subCategory = :alias)', {
        category: normalizedCategory,
        alias: category,
      });
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
    const normalizedPhone = this.normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      throw new BadRequestException('Enter a valid 10-digit dealer number');
    }
    const dealer = await this.dealerRepository
      .createQueryBuilder('dealer')
      .select([
        'dealer.id',
        'dealer.name',
        'dealer.phone',
        'dealer.dealerCode',
        'dealer.town',
        'dealer.district',
        'dealer.state',
        'dealer.electricianCount',
        'dealer.status',
      ])
      .where('dealer.phone = :rawPhone', { rawPhone: phone })
      .orWhere('dealer.phone = :normalizedPhone', { normalizedPhone })
      .orWhere(
        `RIGHT(regexp_replace(COALESCE(dealer.phone, ''), '\\D', '', 'g'), 10) = :normalizedPhone`,
        { normalizedPhone },
      )
      .getOne();
    if (!dealer) throw new NotFoundException('Dealer not found');
    if (!dealer.dealerCode?.trim()) {
      throw new BadRequestException('Dealer code is missing for this account. Please contact admin.');
    }
    const nextElectricianSerial = await this.getNextElectricianSerial(dealer.id, dealer.dealerCode);
    return {
      id: dealer.id,
      name: dealer.name,
      phone: this.normalizePhone(dealer.phone),
      dealerCode: dealer.dealerCode,
      town: dealer.town,
      district: dealer.district,
      state: dealer.state,
      electricianCount: dealer.electricianCount ?? Math.max(0, nextElectricianSerial - 1),
      nextElectricianSerial,
    };
  }

  // ── Scan ───────────────────────────────────────────────────────────────────

  async submitScan(userId: string, role: string, qrCode: string, mode: 'single' | 'multi') {
    const trimmedQrCode = qrCode?.trim();
    if (!trimmedQrCode) {
      throw new BadRequestException('QR code is required');
    }

    return this.dataSource.transaction(async (manager) => {
      const qr = await manager
        .getRepository(QrCode)
        .createQueryBuilder('qr')
        .innerJoinAndSelect('qr.product', 'product')
        .setLock('pessimistic_write')
        .where('qr.code = :qrCode', { qrCode: trimmedQrCode })
        .andWhere('qr.isActive = :isActive', { isActive: true })
        .getOne();

      if (!qr) throw new NotFoundException('QR code not found or invalid');
      if (!qr.product || !qr.product.isActive) {
        throw new BadRequestException('Product is not active');
      }

      if (qr.isScanned) {
        throw new ConflictException(
          'QR code is already redeemed - Please scan valid QR code',
        );
      }

      const existingScan = await manager.getRepository(Scan).findOne({
        where: { qrCodeId: qr.id } as any,
      });
      if (existingScan) {
        throw new ConflictException(
          'QR code is already redeemed - Please scan valid QR code',
        );
      }

      const points = Number(qr.rewardPoints ?? qr.product.points ?? 0);
      const userRole = this.normalizeRole(role);
      const user = await this.getUserByRoleForUpdate(userId, role, manager);
      if (!user) throw new NotFoundException('User not found');
      const userRecord = user as any;

      const scan = manager.getRepository(Scan).create({
        userId,
        userName: userRecord.name ?? 'Unknown',
        role: userRole,
        productId: qr.product.id,
        productName: qr.product.name,
        points,
        mode: mode === 'multi' ? ScanMode.MULTI : ScanMode.SINGLE,
        qrCodeId: qr.id,
      });
      await manager.getRepository(Scan).save(scan);

      await manager.getRepository(QrCode).update(qr.id, {
        isScanned: true,
        scanCount: (qr.scanCount ?? 0) + 1,
        lastScannedBy: userId,
        lastScannedAt: new Date(),
      });

      await manager.getRepository(Product).update(qr.product.id, {
        totalScanned: (qr.product.totalScanned ?? 0) + 1,
      });

      const balanceBefore = Number(userRecord.walletBalance ?? 0);
      const newScans = Number(userRecord.totalScans ?? 0) + 1;
      const newWallet = balanceBefore + points;
      const updateData: Record<string, any> = {
        totalPoints: newWallet,
        totalScans: newScans,
        walletBalance: newWallet,
        lastActivityAt: new Date(),
      };

      if (
        userRole === UserRole.ELECTRICIAN ||
        userRole === UserRole.COUNTERBOY ||
        userRole === UserRole.USER
      ) {
        updateData.tier = this.tierService.calculateElectricianTier(
          newWallet,
        ) as any;
      }

      await this.updateUserByRole(userId, role, updateData, manager);

      await manager.getRepository(Wallet).save(
        manager.getRepository(Wallet).create({
          userId,
          userRole,
          type: TransactionType.CREDIT,
          source: TransactionSource.SCAN,
          amount: points,
          balanceBefore,
          balanceAfter: newWallet,
          description: `Scan: ${qr.product.name}`,
          referenceId: scan.id,
          referenceType: 'scan',
        }),
      );

      return {
        success: true,
        msg: 'QR code scan successfully.',
        scan: {
          id: scan.id,
          productId: qr.product.id,
          productName: qr.product.name,
          points,
          mode,
          scannedAt: scan.scannedAt,
        },
        pointsEarned: points,
        qrcodeprice: points,
        wallet: newWallet,
        wallet_balance: newWallet,
        walletbalance: newWallet,
        currentwallet: newWallet,
      };
    });
  }

  async previewQrCode(qrCode: string) {
    const trimmedQrCode = qrCode?.trim();
    if (!trimmedQrCode) {
      throw new BadRequestException('QR code is required');
    }

    const qr = await this.qrCodeRepository.findOne({
      where: { code: trimmedQrCode, isActive: true },
      relations: ['product'],
    });

    if (!qr || !qr.product || !qr.product.isActive) {
      throw new NotFoundException(
        'Oops! This QR code does not belong to SRV Electricals. Please scan a valid QR code',
      );
    }

    if (qr.isScanned) {
      throw new ConflictException(
        'QR code is already redeemed - Please scan valid QR code',
      );
    }

    const points = Number(qr.rewardPoints ?? qr.product.points ?? 0);

    return {
      success: true,
      msg: 'QR code scan successfully.',
      productId: qr.product.id,
      productName: qr.product.name,
      productImage: qr.product.image ?? null,
      qrcodeprice: points,
      points,
      batchId: qr.batchId ?? null,
      batchNo: qr.batchNo ?? null,
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
    const summary = await this.getWalletSummary(userId, role);

    const [transactions, total] = await this.walletRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      balance: summary.balance,
      wallet: summary.wallet,
      wallet_balance: summary.wallet_balance,
      walletbalance: summary.walletbalance,
      currentwallet: summary.currentwallet,
      totalwallet_amount: summary.totalwallet_amount,
      totalearnedwallet_amount: summary.totalearnedwallet_amount,
      totalredeemedwallet_amount: summary.totalredeemedwallet_amount,
      totalPoints: summary.totalPoints,
      totalScans: summary.totalScans,
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

  async requestBankTransfer(userId: string, role: string, data: { amount: number }) {
    const amount = Number(data.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const normalizedRole = this.normalizeRole(role);

    if (normalizedRole === UserRole.DEALER) {
      const dealer = await this.dealerRepository.findOne({ where: { id: userId } });
      if (!dealer) throw new NotFoundException('Dealer not found');
      if (!dealer.bankLinked || !dealer.accountHolderName || !dealer.bankAccount || !dealer.ifsc) {
        throw new BadRequestException('Please add bank details before requesting transfer');
      }

      const totalBonus = Number((dealer as any).bonusPoints ?? 0);

      if (amount > totalBonus) {
        throw new BadRequestException('Requested amount exceeds available dealer bonus');
      }

      return this.dataSource.transaction(async (manager) => {
        const dealerLock = await manager.getRepository(Dealer)
          .createQueryBuilder('dealer')
          .select([
            'dealer.id',
            'dealer.name',
            'dealer.phone',
            'dealer.walletBalance',
            'dealer.tier',
            'dealer.status',
            'dealer.bonusPoints',
            'dealer.upiId',
            'dealer.bankAccount',
            'dealer.ifsc',
            'dealer.bankName',
            'dealer.accountHolderName',
          ])
          .setLock('pessimistic_write')
          .where('dealer.id = :id', { id: userId })
          .getOne();
        if (!dealerLock) throw new NotFoundException('Dealer not found');

        const currentBonusPoints = Number((dealerLock as any).bonusPoints ?? 0);
        if (currentBonusPoints < amount) {
          throw new BadRequestException('Insufficient bonus points');
        }

        const newBonusPoints = currentBonusPoints - amount;

        const redemption = await manager.getRepository(Redemption).save(
          manager.getRepository(Redemption).create({
            userId,
            userName: dealer.name,
            role: UserRole.DEALER,
            type: 'dealer_bonus_bank_transfer',
            points: amount,
            amount,
            status: 'pending' as any,
            upiId: dealer.upiId,
            bankAccount: dealer.bankAccount,
            ifsc: dealer.ifsc,
            accountHolderName: dealer.accountHolderName,
          }),
        );

        await manager.getRepository(Dealer).update(userId, {
          bonusPoints: newBonusPoints,
        });

        const walletTransaction = await manager.getRepository(Wallet).save(
          manager.getRepository(Wallet).create({
            userId,
            userRole: UserRole.DEALER,
            type: TransactionType.DEBIT,
            source: TransactionSource.REDEMPTION,
            amount,
            balanceBefore: currentBonusPoints,
            balanceAfter: newBonusPoints,
            description: 'Dealer bonus withdrawal request',
            referenceId: redemption.id,
            referenceType: 'redemption',
          }),
        );

        await manager.getRepository(Redemption).update(redemption.id, {
          transactionId: walletTransaction.id,
        });

        return {
          message: 'Bank transfer request submitted successfully',
          redemptionId: redemption.id,
        };
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await this.getUserByRoleForUpdate(userId, role, manager);
      if (!user) throw new NotFoundException('User not found');
      if (
        !(user as any).bankLinked ||
        !(user as any).accountHolderName ||
        !(user as any).bankAccount ||
        !(user as any).ifsc
      ) {
        throw new BadRequestException('Please add bank details before requesting transfer');
      }

      const currentBalance = Number((user as any).walletBalance ?? 0);
      if (currentBalance < amount) {
        throw new BadRequestException('Insufficient points balance');
      }

      const newBalance = currentBalance - amount;
      const redemption = await manager.getRepository(Redemption).save(
        manager.getRepository(Redemption).create({
          userId,
          userName: (user as any).name,
          role: normalizedRole,
          type: 'bank_transfer',
          points: amount,
          amount,
          status: 'pending' as any,
          upiId: (user as any).upiId,
          bankAccount: (user as any).bankAccount,
          ifsc: (user as any).ifsc,
          accountHolderName: (user as any).accountHolderName,
        }),
      );

      await this.updateUserByRole(
        userId,
        role,
        this.buildTransferBalanceUpdate(user, normalizedRole, newBalance, -amount),
        manager,
      );

      const walletTransaction = await manager.getRepository(Wallet).save(
        manager.getRepository(Wallet).create({
          userId,
          userRole: normalizedRole,
          type: TransactionType.DEBIT,
          source: TransactionSource.REDEMPTION,
          amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description: 'Bank transfer withdrawal request',
          referenceId: redemption.id,
          referenceType: 'redemption',
        }),
      );

      await manager.getRepository(Redemption).update(redemption.id, {
        transactionId: walletTransaction.id,
      });

      return {
        message: 'Bank transfer request submitted successfully',
        redemptionId: redemption.id,
        walletBalance: newBalance,
      };
    });
  }

  async redeemReward(userId: string, role: string, data: { schemeId: string; note?: string }) {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(Product).findOne({
        where: { id: data.schemeId, category: 'gift', isActive: true },
      });
      if (!product) throw new NotFoundException('Reward scheme not found');
      if (Number(product.stock ?? 0) <= 0) {
        throw new BadRequestException('Reward scheme is out of stock');
      }

      const normalizedRole = this.normalizeRole(role);
      const user = await this.getUserByRoleForUpdate(userId, role, manager);
      if (!user) throw new NotFoundException('User not found');

      const pointsRequired = Number(product.points ?? 0);
      const currentBalance = Number((user as any).walletBalance ?? 0);
      if (currentBalance < pointsRequired) {
        throw new BadRequestException('Insufficient points for this redemption');
      }

      const newBalance = currentBalance - pointsRequired;
      const redemption = await manager.getRepository(Redemption).save(
        manager.getRepository(Redemption).create({
          userId,
          userName: (user as any).name,
          role: normalizedRole,
          type: 'gift',
          points: pointsRequired,
          amount: product.mrp ?? 0,
          status: 'pending' as any,
          upiId: (user as any).upiId,
          bankAccount: (user as any).bankAccount,
          ifsc: (user as any).ifsc,
          accountHolderName: (user as any).accountHolderName,
        }),
      );

      await this.updateUserByRole(
        userId,
        role,
        this.buildTransferBalanceUpdate(
          user,
          normalizedRole,
          newBalance,
          -pointsRequired,
        ),
        manager,
      );

      const walletTransaction = await manager.getRepository(Wallet).save(
        manager.getRepository(Wallet).create({
          userId,
          userRole: normalizedRole,
          type: TransactionType.DEBIT,
          source: TransactionSource.REDEMPTION,
          amount: pointsRequired,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description: `Reward redemption request for ${product.name}`,
          referenceId: redemption.id,
          referenceType: 'redemption',
        }),
      );

      await manager.getRepository(Redemption).update(redemption.id, {
        transactionId: walletTransaction.id,
      });

      // ── Create GiftOrder so it appears in the admin Gift Orders panel ──
      const userCode: string =
        (user as any).electricianCode ??
        (user as any).dealerCode ??
        (user as any).userCode ??
        (user as any).counterboyCode ??
        '';

      // Resolve dealer name for electricians
      let dealerName: string | undefined;
      if (normalizedRole === UserRole.ELECTRICIAN && (user as any).dealerId) {
        const dealer = await manager.getRepository(Dealer).findOne({
          where: { id: (user as any).dealerId },
        });
        dealerName = dealer?.name ?? undefined;
      }

      await manager.getRepository(GiftOrder).save(
        manager.getRepository(GiftOrder).create({
          userId,
          userName: (user as any).name,
          userCode,
          dealerName,
          role: normalizedRole,
          giftProductId: product.id,
          giftName: product.name,
          giftImage: product.image ?? '',
          pointsUsed: pointsRequired,
          status: GiftOrderStatus.PENDING,
          shippingAddress: (user as any).address ?? undefined,
        }),
      );

      // Decrement gift product stock
      await manager.getRepository(Product).decrement({ id: product.id }, 'stock', 1);

      return {
        message: 'Redemption request submitted successfully',
        redemptionId: redemption.id,
        walletBalance: newBalance,
      };
    });
  }

  async transferPoints(userId: string, role: string, data: { receiverPhone: string; points: number }) {
    if (!Number.isFinite(data.points) || data.points <= 0) {
      throw new BadRequestException('Points must be greater than 0');
    }

    return this.dataSource.transaction(async (manager) => {
      const normalizedRole = this.normalizeRole(role);
      const receiverPhone = this.normalizePhone(data.receiverPhone);
      if (receiverPhone.length !== 10) {
        throw new BadRequestException('Receiver phone number must be 10 digits');
      }

      const sender = await this.getUserByRoleForUpdate(userId, role, manager);
      if (!sender) throw new NotFoundException('Sender not found');

      const senderBalanceBefore = Number((sender as any).walletBalance ?? 0);
      if (senderBalanceBefore < data.points) {
        throw new BadRequestException('Insufficient balance');
      }

      const receiverData = await this.findReceiverByPhone(receiverPhone, manager);
      if (!receiverData) throw new NotFoundException('Receiver not found');
      if (receiverData.user.id === userId && receiverData.role === normalizedRole) {
        throw new BadRequestException('You cannot transfer points to yourself');
      }

      const receiver = await this.getUserByRoleForUpdate(
        receiverData.user.id,
        receiverData.role,
        manager,
      );
      if (!receiver) throw new NotFoundException('Receiver not found');

      const receiverBalanceBefore = Number((receiver as any).walletBalance ?? 0);
      const senderNewBalance = senderBalanceBefore - data.points;
      const receiverNewBalance = receiverBalanceBefore + data.points;

      await this.updateUserByRole(
        userId,
        role,
        this.buildTransferBalanceUpdate(
          sender,
          normalizedRole,
          senderNewBalance,
          -data.points,
        ),
        manager,
      );
      await this.updateUserByRole(
        receiver.id,
        receiverData.role,
        this.buildTransferBalanceUpdate(
          receiver,
          receiverData.role,
          receiverNewBalance,
          data.points,
        ),
        manager,
      );

      await manager.getRepository(Wallet).save(
        manager.getRepository(Wallet).create({
          userId,
          userRole: normalizedRole,
          type: TransactionType.DEBIT,
          source: TransactionSource.TRANSFER,
          amount: data.points,
          balanceBefore: senderBalanceBefore,
          balanceAfter: senderNewBalance,
          description: `Transfer to ${(receiver as any).name} (${receiverPhone})`,
          referenceId: receiver.id,
          referenceType: 'transfer',
        }),
      );

      await manager.getRepository(Wallet).save(
        manager.getRepository(Wallet).create({
          userId: receiver.id,
          userRole: receiverData.role,
          type: TransactionType.CREDIT,
          source: TransactionSource.TRANSFER,
          amount: data.points,
          balanceBefore: receiverBalanceBefore,
          balanceAfter: receiverNewBalance,
          description: `Transfer from ${(sender as any).name} (${(sender as any).phone ?? ''})`,
          referenceId: userId,
          referenceType: 'transfer',
        }),
      );

      return {
        message: 'Points transferred successfully',
        balance: senderNewBalance,
        wallet_balance: senderNewBalance,
        receiverBalance: receiverNewBalance,
      };
    });
  }

  async getDealerBonus(dealerId: string) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new NotFoundException('Dealer not found');

    const totalBonus = Number((dealer as any).bonusPoints ?? 0);

    return {
      availableBonus: totalBonus,
      totalBonus,
      pendingWithdrawals: 0,
      bonusPoints: totalBonus,
      bonusStatus: (dealer as any).bonusStatus ?? 'pending',
    };
  }

  async requestDealerBonusWithdrawal(dealerId: string, data: { amount: number }) {
    return this.requestBankTransfer(dealerId, UserRole.DEALER, { amount: data.amount });
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
      .select([
        'electrician.id',
        'electrician.name',
        'electrician.phone',
        'electrician.walletBalance',
        'electrician.totalPoints',
        'electrician.tier',
        'electrician.status',
        'electrician.city',
        'electrician.state',
        'electrician.district',
        'electrician.joinedDate',
        'electrician.dealerId',
        'electrician.electricianCode',
        'electrician.totalScans',
        'electrician.totalRedemptions',
      ])
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

    const existing = await this.findRecordByPhone(this.electricianRepository, 'electrician', body.phone);
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

    const manualCode = this.normalizeElectricianCode(body?.electricianCode);
    const code = manualCode ?? await this.generateNextElectricianCodeForDealer(dealerId, dealer.dealerCode);
    const existingCode = await this.electricianRepository.findOne({ where: { electricianCode: code } });
    if (existingCode) {
      throw new ConflictException('Electrician with this code already exists');
    }

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
    await this.ensurePersistenceArtifacts();
    const user = await this.getUserByRole(userId, role);
    const userRole = this.normalizeRole(role);
    const ticket = this.supportTicketRepository.create({
      userId,
      userName: user?.name ?? 'Unknown',
      userRole,
      subject: data.subject,
      message: data.comment,
      photoUrl: data.photoUrl ?? null,
      status: SupportTicketStatus.OPEN,
      priority: SupportTicketPriority.MEDIUM,
    });

    await this.supportTicketRepository.save(ticket);
    return { message: 'Support ticket created successfully', ticketId: ticket.id };
  }

  async getMySupportTickets(userId: string, role: string) {
    const tickets = await this.supportTicketRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return { data: tickets };
  }

  async replyToTicket(userId: string, ticketId: string, message: string) {
    const ticket = await this.supportTicketRepository.findOne({ where: { id: ticketId, userId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === SupportTicketStatus.CLOSED || ticket.status === SupportTicketStatus.RESOLVED) {
      throw new BadRequestException('This ticket is already closed');
    }

    const newReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender: 'user',
      senderName: ticket.userName || 'User',
      message,
      timestamp: new Date(),
    };
    const existingReplies = ticket.replies || [];
    await this.supportTicketRepository.update(ticketId, {
      replies: [...existingReplies, newReply],
      status: SupportTicketStatus.OPEN,
    });
    return { message: 'Reply sent successfully' };
  }

  async closeTicket(userId: string, ticketId: string) {
    const ticket = await this.supportTicketRepository.findOne({ where: { id: ticketId, userId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    await this.supportTicketRepository.update(ticketId, {
      status: SupportTicketStatus.CLOSED,
    });
    return { message: 'Ticket closed successfully' };
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

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getMyOrders(userId: string) {
    const orders = await this.giftOrderRepository.find({
      where: { userId },
      order: { orderedAt: 'DESC' },
    });

    return orders.map(o => ({
      id: o.id,
      status: o.status,
      title: o.giftName,
      userId: o.userId,
      userName: o.userName,
      points: o.pointsUsed,
      deliveredAt: o.processedAt?.toISOString() ?? null,
      createdAt: o.orderedAt.toISOString(),
    }));
  }

  // ── Rating ─────────────────────────────────────────────────────────────────

  async submitRating(userId: string, rating: number, review?: string) {
    await this.ensurePersistenceArtifacts();

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    const existingUser = await this.getUserByRole(userId, UserRole.DEALER)
      ?? await this.getUserByRole(userId, UserRole.ELECTRICIAN)
      ?? await this.getUserByRole(userId, UserRole.USER)
      ?? await this.getUserByRole(userId, UserRole.COUNTERBOY);
    const userRole = existingUser
      ? this.normalizeRole(
        (existingUser as any).dealerCode ? UserRole.DEALER
          : (existingUser as any).electricianCode ? UserRole.ELECTRICIAN
            : (existingUser as any).counterboyCode ? UserRole.COUNTERBOY
              : UserRole.USER,
      )
      : UserRole.USER;

    await this.dataSource.query(
      `
        INSERT INTO "app_ratings" ("userId", "userRole", "rating", "review")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ON CONSTRAINT "app_ratings_pkey"
        DO UPDATE SET
          "userRole" = EXCLUDED."userRole",
          "rating" = EXCLUDED."rating",
          "review" = EXCLUDED."review",
          "updatedAt" = now()
      `,
      [userId, userRole, numericRating, review ?? null],
    );

    return {
      id: `rating_${userId}`,
      rating: numericRating,
      review: review ?? null,
    };
  }

  async getRating(userId: string) {
    await this.ensurePersistenceArtifacts();

    const rows = await this.dataSource.query(
      `
        SELECT "rating", "review"
        FROM "app_ratings"
        WHERE "userId" = $1
        LIMIT 1
      `,
      [userId],
    );

    const record = rows?.[0];
    if (!record) {
      return null;
    }

    return {
      id: `rating_${userId}`,
      rating: Number(record.rating),
      review: record.review ?? null,
    };
  }
}
