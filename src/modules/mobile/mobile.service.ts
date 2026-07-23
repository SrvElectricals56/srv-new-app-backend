import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder, ProductOrderStatus } from '../../database/entities/product-order.entity';
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
import { AppActivityEvent, AppActivityEventType } from '../../database/entities/app-activity-event.entity';
import { UserRole, UserStatus, ScanMode, TransactionType, TransactionSource, SupportTicketStatus, SupportTicketPriority } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';
import { extractQrCodeCandidates } from '../../common/utils/qr-code.util';

const PRODUCT_ORDER_STATUS_LABELS: Record<ProductOrderStatus, string> = {
  [ProductOrderStatus.PENDING]: 'Pending',
  [ProductOrderStatus.APPROVED]: 'Approved',
  [ProductOrderStatus.OUT_FOR_DELIVERY]: 'Shipped',
  [ProductOrderStatus.SHIPPED]: 'Shipped',
  [ProductOrderStatus.DELIVERED]: 'Delivered',
  [ProductOrderStatus.REJECTED]: 'Rejected',
  [ProductOrderStatus.CANCELLED]: 'Cancelled',
  [ProductOrderStatus.RETURNED]: 'Returned',
  [ProductOrderStatus.REFUNDED]: 'Refunded',
};

function getPublicOrderCode(id: string) {
  let hash = 0;
  for (const character of String(id)) hash = ((hash * 31) + character.charCodeAt(0)) | 0;
  return `SRV${String(Math.abs(hash) % 100000).padStart(5, '0')}`;
}

@Injectable()
export class MobileService {
  constructor(
    private dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductCartItem)
    private productCartItemRepository: Repository<ProductCartItem>,
    @InjectRepository(ProductOrder)
    private productOrderRepository: Repository<ProductOrder>,
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
    @InjectRepository(AppActivityEvent)
    private appActivityRepository: Repository<AppActivityEvent>,
    private readonly tierService: TierService,
  ) {}

  private getPublicBaseUrl() {
    const appUrl = this.configService.get<string>('APP_URL')?.trim();
    if (appUrl) return appUrl.replace(/\/$/, '');

    const host = this.configService.get<string>('SERVER_HOST')?.trim() || 'localhost';
    if (/^https?:\/\//i.test(host)) return host.replace(/\/$/, '');

    const port = this.configService.get<string>('PORT') || '3001';
    return `http://${host}:${port}`;
  }

  private normalizeUploadUrl(value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    const publicBaseUrl = this.getPublicBaseUrl();

    // Already a relative path → prepend current base URL
    if (trimmed.startsWith('/uploads/')) return `${publicBaseUrl}${trimmed}`;

    try {
      const parsed = new URL(trimmed);
      // Rewrite any private/local IP to the current public base URL
      const isPrivate = /^(localhost|127\.0\.0\.1|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/.test(parsed.hostname);
      if (isPrivate && parsed.pathname.startsWith('/uploads/')) {
        return `${publicBaseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return trimmed;
    } catch {
      // Invalid URL but contains /uploads/ → extract and rebuild
      const uploadPathIndex = trimmed.indexOf('/uploads/');
      if (uploadPathIndex >= 0) return `${publicBaseUrl}${trimmed.slice(uploadPathIndex)}`;
      return trimmed;
    }
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

  private estimateDeliveryDate(from = new Date()) {
    const estimated = new Date(from);
    estimated.setDate(estimated.getDate() + 5);
    return estimated;
  }

  private isWithinHours(value: Date | string | null | undefined, hours: number) {
    if (!value) return false;
    const start = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(start.getTime())) return false;
    return Date.now() - start.getTime() <= hours * 60 * 60 * 1000;
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
    const normalizedRole = this.normalizeRole(role);
    const select = [
      'user.id',
      'user.name',
      'user.phone',
      'user.walletBalance',
      'user.tier',
      'user.status',
      'user.address',
    ];
    switch (normalizedRole) {
      case UserRole.DEALER:
        select.push('user.bonusPoints', 'user.dealerCode');
        break;
      case UserRole.ELECTRICIAN:
        select.push('user.totalPoints', 'user.dealerId', 'user.electricianCode');
        break;
      case UserRole.USER:
        select.push('user.totalPoints', 'user.userCode');
        break;
      case UserRole.COUNTERBOY:
        select.push('user.totalPoints', 'user.dealerId', 'user.counterboyCode');
        break;
    }

    select.push(
      'user.bankLinked', 'user.accountHolderName', 'user.upiId',
      'user.bankAccount', 'user.ifsc', 'user.bankName',
    );
    return this.getUserRepositoryByRole(role, manager)
      .createQueryBuilder('user')
      .select(select)
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

  private async buildFirstScanDetails(
    qr: QrCode,
    existingScan: Scan | null,
    manager: EntityManager,
  ) {
    const normalizeFirstScan = (details: Record<string, any>) => ({
      name: details.name ?? null,
      phone: details.phone ?? null,
      role: details.role ?? null,
      dealerName: details.dealerName ?? null,
      dealerPhone: details.dealerPhone ?? null,
      productName: details.productName ?? (qr as any).product?.name ?? qr.productName ?? null,
      scannedAt: details.scannedAt ?? qr.lastScannedAt ?? null,
    });

    const rawRows = await manager.query(
      `
        SELECT DISTINCT ON (s."qrCodeId")
          s."id",
          s."userId",
          s."userName",
          s."role"::text AS "role",
          COALESCE(e."name", d."name", u."name", cb."name", qe."name", qd."name", qu."name", qcb."name", s."userName", q."redeemerName") AS "name",
          COALESCE(e."phone", d."phone", u."phone", cb."phone", qe."phone", qd."phone", qu."phone", qcb."phone", q."redeemerPhone") AS "phone",
          COALESCE(linked_dealer."name", q_linked_dealer."name", d."name", qd."name") AS "dealerName",
          COALESCE(linked_dealer."phone", q_linked_dealer."phone", d."phone", qd."phone") AS "dealerPhone",
          s."productName",
          s."scannedAt"
        FROM "qr_codes" q
        LEFT JOIN "scans" s
          ON s."qrCodeId" = q."id"::text
        LEFT JOIN "electricians" e
          ON s."role"::text = 'electrician' AND e."id"::text = s."userId"
        LEFT JOIN "dealers" d
          ON s."role"::text = 'dealer' AND d."id"::text = s."userId"
        LEFT JOIN "app_users" u
          ON s."role"::text = 'user' AND u."id"::text = s."userId"
        LEFT JOIN "counterboys" cb
          ON s."role"::text = 'counterboy' AND cb."id"::text = s."userId"
        LEFT JOIN "dealers" linked_dealer
          ON linked_dealer."id"::text = COALESCE(e."dealerId"::text, cb."dealerId"::text)
        LEFT JOIN "electricians" qe
          ON qe."id"::text = q."lastScannedBy"
        LEFT JOIN "dealers" qd
          ON qd."id"::text = q."lastScannedBy"
        LEFT JOIN "app_users" qu
          ON qu."id"::text = q."lastScannedBy"
        LEFT JOIN "counterboys" qcb
          ON qcb."id"::text = q."lastScannedBy"
        LEFT JOIN "dealers" q_linked_dealer
          ON q_linked_dealer."id"::text = COALESCE(qe."dealerId"::text, qcb."dealerId"::text)
        WHERE q."id" = $1
        ORDER BY s."qrCodeId", s."scannedAt" ASC NULLS LAST
      `,
      [qr.id],
    );
    const raw = rawRows?.[0];
    if (raw?.name || raw?.phone || raw?.dealerName || raw?.dealerPhone || raw?.scannedAt) {
      return normalizeFirstScan({
        ...raw,
        role: raw.role ?? existingScan?.role ?? null,
      });
    }

    const scanRole = existingScan?.role || UserRole.ELECTRICIAN;
    const scanUserId = existingScan?.userId || qr.lastScannedBy;
    let resolvedRole = scanRole;
    let user = scanUserId
      ? await this.getUserByRole(scanUserId, scanRole, manager)
      : null;

    if (scanUserId && !user && !existingScan) {
      const rolesToTry = [
        UserRole.ELECTRICIAN,
        UserRole.DEALER,
        UserRole.USER,
        UserRole.COUNTERBOY,
      ].filter((candidate) => candidate !== scanRole);
      for (const candidateRole of rolesToTry) {
        user = await this.getUserByRole(scanUserId, candidateRole, manager);
        if (user) {
          resolvedRole = candidateRole;
          break;
        }
      }
    }
    const userRecord = user as any;

    let dealer: any = null;
    if (userRecord?.dealerId) {
      dealer = await manager.getRepository(Dealer).findOne({
        where: { id: userRecord.dealerId } as any,
      });
    } else if (this.normalizeRole(resolvedRole) === UserRole.DEALER) {
      dealer = userRecord;
    }

    return normalizeFirstScan({
      name: userRecord?.name ?? existingScan?.userName ?? qr.redeemerName ?? null,
      phone: userRecord?.phone ?? qr.redeemerPhone ?? null,
      role: resolvedRole,
      dealerName: dealer?.name ?? userRecord?.dealerName ?? null,
      dealerPhone: dealer?.phone ?? userRecord?.dealerPhone ?? null,
      productName: existingScan?.productName ?? (qr as any).product?.name ?? null,
      scannedAt:
        existingScan?.scannedAt instanceof Date
          ? existingScan.scannedAt.toISOString()
          : existingScan?.scannedAt ?? qr.lastScannedAt ?? null,
    });
  }

  private async throwQrAlreadyRedeemed(
    qr: QrCode,
    existingScan: Scan | null,
    manager: EntityManager,
  ): Promise<never> {
    throw new ConflictException({
      message: 'QR code is already redeemed - Please scan valid QR code',
      code: 'QR_ALREADY_REDEEMED',
      firstScan: await this.buildFirstScanDetails(qr, existingScan, manager),
    });
  }

  private getNumericQrCandidates(qrCandidates: string[]) {
    const maxBigInt = BigInt('9223372036854775807');
    return qrCandidates
      .map((candidate) => candidate.trim())
      .filter((candidate) => /^\d+$/.test(candidate))
      .filter((candidate) => {
        try {
          return BigInt(candidate) <= maxBigInt;
        } catch {
          return false;
        }
      });
  }

  private async findQrForScan(
    manager: EntityManager,
    qrCandidates: string[],
    lock = false,
  ) {
    const numericCandidates = this.getNumericQrCandidates(qrCandidates);
    const exactQuery = manager
      .getRepository(QrCode)
      .createQueryBuilder('qr')
      .innerJoinAndSelect('qr.product', 'product')
      .where('qr.code IN (:...qrCodes)', { qrCodes: qrCandidates });

    if (lock) {
      exactQuery.setLock('pessimistic_write');
    }

    const exactMatch = await exactQuery.getOne();
    if (exactMatch) return exactMatch;

    if (numericCandidates.length) {
      const legacyIdQuery = manager
        .getRepository(QrCode)
        .createQueryBuilder('qr')
        .innerJoinAndSelect('qr.product', 'product')
        .where('qr."legacyId" IN (:...legacyIds)', { legacyIds: numericCandidates });
      if (lock) legacyIdQuery.setLock('pessimistic_write');
      const legacyIdMatch = await legacyIdQuery.getOne();
      if (legacyIdMatch) return legacyIdMatch;
    }

    const normalizedCandidates = qrCandidates.map((candidate) => candidate.toLowerCase());
    const normalizedQuery = manager
      .getRepository(QrCode)
      .createQueryBuilder('qr')
      .innerJoinAndSelect('qr.product', 'product')
      .where('LOWER(qr.code) IN (:...normalizedQrCodes)', { normalizedQrCodes: normalizedCandidates });

    if (lock) normalizedQuery.setLock('pessimistic_write');
    return normalizedQuery.getOne();
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

    if (currentRole) {
      const normalizedCurrentRole = this.normalizeRole(currentRole);
      if (normalizedCurrentRole !== UserRole.ELECTRICIAN) {
        throw new BadRequestException('Only electricians can transfer points');
      }
      if (receiverData.role !== UserRole.ELECTRICIAN) {
        throw new BadRequestException('Points can only be transferred to another electrician');
      }
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
    const scanRepo = manager
      ? manager.getRepository(Scan)
      : this.scanRepository;

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

    // Count actual scan records so that multi-scan products are all counted
    const actualScanCount = await scanRepo.count({ where: { userId } });

    // Keep user row in sync if it drifted
    if (Number((user as any)?.totalScans ?? 0) !== actualScanCount) {
      await this.updateUserByRole(userId, role, { totalScans: actualScanCount });
    }

    const balance = Number((user as any)?.walletBalance ?? 0);
    // Dealers earn via bonusPoints (commission from electrician activity), not walletBalance
    const isDealer = normalizedRole === UserRole.DEALER;
    const totalPoints = isDealer
      ? Number((user as any)?.bonusPoints ?? 0)
      : balance;

    return {
      balance,
      wallet: balance,
      wallet_balance: balance,
      walletbalance: balance,
      currentwallet: balance,
      totalwallet_amount: balance,
      totalearnedwallet_amount: Number(totals?.totalEarned ?? 0),
      totalredeemedwallet_amount: Number(totals?.totalRedeemed ?? 0),
      totalPoints,
      totalScans: actualScanCount,
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
      const imageValue = this.normalizeUploadUrl(product.image) || null;
      
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
        imageUrl: this.normalizeUploadUrl(category.imageUrl) ?? category.imageUrl ?? null,
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
    const imageValue = this.normalizeUploadUrl(product.image) ?? product.image?.trim() ?? null;
    return {
      ...product,
      image: imageValue,
      imageUrl: imageValue,
    };
  }

  private getUserCodeForRole(user: any, role: UserRole) {
    if (role === UserRole.ELECTRICIAN) return user?.electricianCode ?? '';
    if (role === UserRole.DEALER) return user?.dealerCode ?? '';
    if (role === UserRole.COUNTERBOY) return user?.counterboyCode ?? '';
    return user?.userCode ?? '';
  }

  async addProductToCart(userId: string, role: string, body: { productId: string; quantity?: number }) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    if (!body.productId) throw new BadRequestException('Product is required');

    const normalizedRole = this.normalizeRole(role);
    const [user, product] = await Promise.all([
      this.getUserByRole(userId, normalizedRole),
      this.productRepository.findOne({ where: { id: body.productId, isActive: true } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!product || product.category === 'gift') throw new NotFoundException('Product not found');

    const existing = await this.productCartItemRepository.findOne({
      where: { userId, userRole: normalizedRole, productId: product.id },
    });

    const itemData = {
      userId,
      userRole: normalizedRole,
      userName: (user as any).name ?? '',
      userPhone: (user as any).phone ?? '',
      userCode: this.getUserCodeForRole(user, normalizedRole),
      productId: product.id,
      productName: product.name,
      productImage: this.normalizeUploadUrl(product.image) ?? product.image ?? '',
      quantity,
      price: Number(product.price ?? 0),
    };

    const saved = existing
      ? await this.productCartItemRepository.save({ ...existing, ...itemData, quantity: existing.quantity + quantity })
      : await this.productCartItemRepository.save(this.productCartItemRepository.create(itemData));

    return { message: 'Product added to cart', item: saved };
  }

  async getTopFive(role: string) {
    const normalized = String(role || 'electrician').trim().toLowerCase();
    const addressOf = (row: any) => row.district || row.city || row.town || row.state || row.address || 'Location not added';

    if (normalized === 'dealer') {
      const rows = await this.dealerRepository.find({ where: { status: UserStatus.ACTIVE }, order: { electricianCount: 'DESC', joinedDate: 'ASC' }, take: 5 });
      return rows.map((row, index) => ({ rank: index + 1, id: row.id, name: row.name, value: Number(row.electricianCount || 0), valueLabel: 'Associated electricians', address: addressOf(row) }));
    }

    if (normalized === 'user' || normalized === 'customer') {
      const rows = await this.appUserRepository.createQueryBuilder('member')
        .leftJoin(ProductOrder, 'orders', 'orders.userId = member.id::text AND orders.userRole = :role', { role: UserRole.USER })
        .select(['member.id AS id', 'member.name AS name', 'member.city AS city', 'member.district AS district', 'member.state AS state', 'member.address AS address'])
        .addSelect('COUNT(orders.id)', 'value')
        .where('member.status = :status', { status: UserStatus.ACTIVE })
        .groupBy('member.id').addGroupBy('member.name').addGroupBy('member.city').addGroupBy('member.district').addGroupBy('member.state').addGroupBy('member.address')
        .orderBy('COUNT(orders.id)', 'DESC').addOrderBy('member.name', 'ASC').limit(5).getRawMany();
      return rows.map((row: any, index: number) => ({ rank: index + 1, id: row.id, name: row.name, value: Number(row.value || 0), valueLabel: 'Total orders', address: addressOf(row) }));
    }

    if (normalized === 'counterboy') {
      const rows = await this.counterBoyRepository.find({ where: { status: UserStatus.ACTIVE }, order: { totalPoints: 'DESC', totalScans: 'DESC' }, take: 5 });
      return rows.map((row, index) => ({ rank: index + 1, id: row.id, name: row.name, value: Number(row.totalPoints || 0), valueLabel: 'Total points', address: addressOf(row) }));
    }

    const rows = await this.electricianRepository.find({ where: { status: UserStatus.ACTIVE }, order: { totalPoints: 'DESC', totalScans: 'DESC' }, take: 5 });
    return rows.map((row, index) => ({ rank: index + 1, id: row.id, name: row.name, value: Number(row.totalPoints || 0), valueLabel: 'Total points', address: addressOf(row) }));
  }

  async trackActivity(userId: string, role: string, body: {
    eventType: AppActivityEventType | string;
    eventLabel?: string;
    screen?: string;
    previousScreen?: string;
    productId?: string;
    productName?: string;
    productCategory?: string;
    quantity?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }) {
    const normalizedRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, normalizedRole);
    if (!user) throw new NotFoundException('User not found');

    const eventType = Object.values(AppActivityEventType).includes(body.eventType as AppActivityEventType)
      ? body.eventType as AppActivityEventType
      : AppActivityEventType.BUTTON_TAP;

    const event = this.appActivityRepository.create({
      userId,
      userRole: normalizedRole,
      userName: (user as any).name ?? '',
      userPhone: (user as any).phone ?? '',
      userCode: this.getUserCodeForRole(user, normalizedRole),
      eventType,
      eventLabel: body.eventLabel?.trim() || eventType,
      screen: body.screen?.trim() || null,
      previousScreen: body.previousScreen?.trim() || null,
      productId: body.productId?.trim() || null,
      productName: body.productName?.trim() || null,
      productCategory: body.productCategory?.trim() || null,
      quantity: Math.max(1, Number(body.quantity ?? 1)),
      durationMs: Math.max(0, Math.round(Number(body.durationMs ?? 0))),
      metadata: body.metadata ?? null,
    });

    await this.appActivityRepository.save(event);
    return { message: 'Activity tracked', id: event.id };
  }

  async createProductOrder(userId: string, role: string, body: { productId: string; quantity?: number; shippingAddress?: string }) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    if (!body.productId) throw new BadRequestException('Product is required');

    const normalizedRole = this.normalizeRole(role);
    const [user, product] = await Promise.all([
      this.getUserByRole(userId, normalizedRole),
      this.productRepository.findOne({ where: { id: body.productId, isActive: true } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!product || product.category === 'gift') throw new NotFoundException('Product not found');
    if (Number(product.stock ?? 0) <= 0) throw new BadRequestException('Product is out of stock');

    const order = await this.productOrderRepository.save(
      this.productOrderRepository.create({
        userId,
        userRole: normalizedRole,
        userName: (user as any).name ?? '',
        userPhone: (user as any).phone ?? '',
        userCode: this.getUserCodeForRole(user, normalizedRole),
        productId: product.id,
        productName: product.name,
        productImage: this.normalizeUploadUrl(product.image) ?? product.image ?? '',
        quantity,
        price: Number(product.price ?? 0),
        status: ProductOrderStatus.PENDING,
        shippingAddress: body.shippingAddress ?? (user as any).address ?? '',
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        estimatedDeliveryAt: this.estimateDeliveryDate(),
        deliveryNotes: 'Order confirmed. Expected delivery in 4 to 5 days.',
      }),
    );

    await this.productRepository.decrement({ id: product.id }, 'stock', quantity);

    return { message: 'Product order submitted successfully', order };
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

    return {
      data: filtered.map((banner) => ({
        ...banner,
        imageUrl: this.normalizeUploadUrl(banner.imageUrl),
      })),
    };
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

    return {
      data: filteredNotifications.map((n) => ({
        ...n,
        imageUrl: this.normalizeUploadUrl((n as any).imageUrl) ?? (n as any).imageUrl ?? null,
      })),
    };
  }

  async deleteNotification(id: string) {
    const notification = await this.notificationRepository.findOne({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    await this.notificationRepository.remove(notification);
    return { message: 'Notification deleted successfully' };
  }

  async registerPushToken(userId: string, role: string, token: string, platform?: string) {
    if (!token || !/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    const userRole = this.normalizeRole(role);
    const user = await this.getUserByRole(userId, userRole);
    if ((user as any)?.pushEnabled === false) {
      await this.dataSource.query(
        `UPDATE "mobile_push_tokens" SET "enabled" = false, "updatedAt" = now() WHERE "userId" = $1 AND "userRole" = $2`,
        [userId, userRole],
      );
      return { message: 'Push notifications are disabled for this user' };
    }

    await this.dataSource.query(`
      INSERT INTO "mobile_push_tokens" ("token", "userId", "userRole", "platform", "enabled", "updatedAt")
      VALUES ($1, $2, $3, $4, true, now())
      ON CONFLICT ("token") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "userRole" = EXCLUDED."userRole",
        "platform" = EXCLUDED."platform",
        "enabled" = true,
        "updatedAt" = now()
    `, [token, userId, userRole, platform ?? null]);
    return { message: 'Push token registered successfully' };
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
      qrFirstScannerVisibility: {
        scannerName: map['qrFirstScannerShowScannerName'] !== 'false',
        scannerPhone: map['qrFirstScannerShowScannerPhone'] !== 'false',
        dealerName: map['qrFirstScannerShowDealerName'] !== 'false',
        dealerPhone: map['qrFirstScannerShowDealerPhone'] !== 'false',
        productName: map['qrFirstScannerShowProductName'] !== 'false',
        scannedAt: map['qrFirstScannerShowScannedAt'] !== 'false',
      },
      minimumOrderAmounts: {
        electrician: Number(map['minimumOrderAmountElectrician'] ?? 5000),
        dealer: Number(map['minimumOrderAmountDealer'] ?? 5000),
        user: Number(map['minimumOrderAmountUser'] ?? 5000),
        counterboy: Number(map['minimumOrderAmountCounterboy'] ?? 5000),
      },
      upiOnlyMode: map['upiOnlyMode'] === 'true',
      playStoreUrl: map['playStoreUrl'] ?? 'https://play.google.com/store/apps/details?id=com.srvelectricals.app',
      appStoreUrl: map['appStoreUrl'] ?? '',
      generalCatalogPdfUrl: this.normalizeUploadUrl(map['generalCatalogPdfUrl'] ?? map['catalogPdfUrl']),
      dealerCatalogPdfUrl: this.normalizeUploadUrl(map['dealerCatalogPdfUrl']),
      catalogPdfUrl: this.normalizeUploadUrl(map['generalCatalogPdfUrl'] ?? map['catalogPdfUrl']),
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
    return {
      data: offers.map((o) => ({
        ...o,
        imageUrl: this.normalizeUploadUrl((o as any).imageUrl) ?? (o as any).imageUrl ?? null,
      })),
    };
  }

  // ── Testimonials ───────────────────────────────────────────────────────────

  async getTestimonials() {
    // Only return active testimonials — when admin deletes/deactivates, app reflects it
    const testimonials = await this.testimonialRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
    return {
      data: testimonials.map((t) => ({
        ...t,
        imageUrl: this.normalizeUploadUrl((t as any).imageUrl) ?? (t as any).imageUrl ?? null,
      })),
    };
  }

  // ── Gift Products ──────────────────────────────────────────────────────────

  async getGiftProducts(role?: string) {
    const qb = this.productRepository
      .createQueryBuilder('p')
      .where('p.category = :cat', { cat: 'gift' })
      .andWhere('p.isActive = :active', { active: true });

    if (role) {
      // 'user' role in app = 'customer' in admin panel — treat as aliases
      // 'counterboy' shares gifts with 'electrician' — both earn by scanning
      const normalizedRole = role === 'user' ? 'customer' : role;
      qb.andWhere('(LOWER(p.subCategory) = :role OR LOWER(p.subCategory) = :all)', {
        role: normalizedRole.toLowerCase(),
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
        imageUrl: this.normalizeUploadUrl(p.image) ?? p.image ?? null,
        pointsRequired: p.points ?? 0,
        // Older gift products used price only; expose it as MRP until an explicit
        // MRP has been saved so every gift card shows the correct value.
        mrp: p.mrp ?? p.price ?? 0,
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
        imageUrl: this.normalizeUploadUrl(p.image) ?? p.image ?? null,
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
    const qrCandidates = extractQrCodeCandidates(qrCode);
    if (!qrCandidates.length) {
      throw new BadRequestException('QR code is required');
    }

    return this.dataSource.transaction(async (manager) => {
      const qr = await this.findQrForScan(manager, qrCandidates, true);

      if (!qr || !qr.product) {
        throw new NotFoundException(
          'Oops! This QR code does not belong to SRV Electricals. Please scan a valid QR code',
        );
      }

      const existingScan = await manager.getRepository(Scan).findOne({
        where: { qrCodeId: qr.id } as any,
      });
      if (qr.isScanned || existingScan) {
        await this.throwQrAlreadyRedeemed(qr, existingScan, manager);
      }

      if (!qr.isActive || !qr.product.isActive) {
        throw new NotFoundException(
          'Oops! This QR code does not belong to SRV Electricals. Please scan a valid QR code',
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
        redeemerName: userRecord.name ?? 'Unknown',
        redeemerPhone: userRecord.phone ?? null,
      });

      await manager.query(
        `
          UPDATE "qr_code_batches"
          SET "usedQty" = "usedQty" + 1,
              "activeQty" = GREATEST("activeQty" - 1, 0),
              "updatedAt" = now()
          WHERE "batchId" = $1
        `,
        [qr.batchId ?? (qr.batchNo ? String(qr.batchNo) : qr.id)],
      );

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
          scannedAt: scan.scannedAt instanceof Date
            ? scan.scannedAt.toISOString()
            : scan.scannedAt,
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
    const qrCandidates = extractQrCodeCandidates(qrCode);
    if (!qrCandidates.length) {
      throw new BadRequestException('QR code is required');
    }

    return this.dataSource.transaction(async (manager) => {
      const qr = await this.findQrForScan(manager, qrCandidates);

      if (!qr || !qr.product) {
        throw new NotFoundException(
          'Oops! This QR code does not belong to SRV Electricals. Please scan a valid QR code',
        );
      }

      const existingScan = await manager.getRepository(Scan).findOne({
        where: { qrCodeId: qr.id } as any,
        order: { scannedAt: 'ASC' },
      });
      if (qr.isScanned || existingScan) {
        await this.throwQrAlreadyRedeemed(qr, existingScan, manager);
      }

      if (!qr.isActive || !qr.product.isActive) {
        throw new NotFoundException(
          'Oops! This QR code does not belong to SRV Electricals. Please scan a valid QR code',
        );
      }

      const points = Number(qr.rewardPoints ?? qr.product.points ?? 0);

      return {
        success: true,
        msg: 'QR code scan successfully.',
        productId: qr.product.id,
        productName: qr.product.name,
        productImage: this.normalizeUploadUrl(qr.product.image) ?? qr.product.image ?? null,
        qrcodeprice: points,
        points,
        batchId: qr.batchId ?? null,
        batchNo: qr.batchNo ?? null,
      };
    });
  }

  async getScanHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [scans, total] = await this.scanRepository.findAndCount({
      where: { userId },
      order: { scannedAt: 'DESC' },
      skip,
      take: limit,
    });
    const data = scans.map(s => ({
      ...s,
      scannedAt: s.scannedAt instanceof Date ? s.scannedAt.toISOString() : s.scannedAt,
    }));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
    const redemptionIds = transactions
      .filter((tx) => tx.referenceType === 'redemption' && tx.referenceId)
      .map((tx) => String(tx.referenceId));
    const linkedRedemptions = redemptionIds.length
      ? await this.redemptionRepository
          .createQueryBuilder('redemption')
          .where('redemption.id IN (:...ids)', { ids: redemptionIds })
          .getMany()
      : [];
    const redemptionById = new Map(linkedRedemptions.map((redemption) => [redemption.id, redemption]));
    const enrichedTransactions = transactions.map((tx) => {
      const linkedRedemption = tx.referenceType === 'redemption' && tx.referenceId
        ? redemptionById.get(String(tx.referenceId))
        : undefined;
      return linkedRedemption
        ? {
            ...tx,
            linkedRedemption: {
              id: linkedRedemption.id,
              type: linkedRedemption.type,
              status: linkedRedemption.status,
              giftName: (linkedRedemption as any).giftName ?? null,
              points: linkedRedemption.points,
              amount: linkedRedemption.amount,
              requestedAt: linkedRedemption.requestedAt,
            },
          }
        : tx;
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
        data: enrichedTransactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async saveBankAccount(userId: string, role: string, data: {
    accountHolderName: string; upiId: string; bankName?: string | null; accountNumber?: string | null; ifsc?: string | null;
  }) {
    const accountHolderName = data.accountHolderName?.trim();
    const upiId = data.upiId?.trim();
    if (!accountHolderName || !upiId) {
      throw new BadRequestException('Account holder name and UPI ID are required');
    }

    const updateData: any = {
      accountHolderName,
      upiId,
      bankName: data.bankName?.trim() || null,
      bankAccount: data.accountNumber?.trim() || null,
      ifsc: data.ifsc?.trim().toUpperCase() || null,
      bankLinked: true,
    };

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
      if (!dealer.bankLinked || !dealer.accountHolderName || !dealer.upiId) {
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
        !(user as any).upiId
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

  async redeemReward(userId: string, role: string, data: { schemeId: string; note?: string; giftImage?: string }) {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(Product).findOne({
        where: { id: data.schemeId, category: 'gift', isActive: true },
      });
      if (!product) throw new NotFoundException('Reward scheme not found');

      const normalizedRole = this.normalizeRole(role);
      const productRole = String(product.subCategory ?? '').trim().toLowerCase();
      const expectedProductRole = normalizedRole === UserRole.USER
        ? 'customer'
        : String(normalizedRole).toLowerCase();
      if (!productRole || (productRole !== 'all' && productRole !== expectedProductRole)) {
        throw new ForbiddenException('This reward is not available for your role');
      }
      if (Number(product.stock ?? 0) <= 0) {
        throw new BadRequestException('Reward scheme is out of stock');
      }

      const user = await this.getUserByRoleForUpdate(userId, role, manager);
      if (!user) throw new NotFoundException('User not found');

      const pointsRequired = Number(product.points ?? 0);

      // Dealers spend from bonusPoints; all other roles spend from walletBalance
      const isDealerRole = normalizedRole === UserRole.DEALER;
      const currentBalance = isDealerRole
        ? Number((user as any).bonusPoints ?? 0)
        : Number((user as any).walletBalance ?? 0);

      if (currentBalance < pointsRequired) {
        throw new BadRequestException('Insufficient points for this redemption');
      }

      const newBalance = currentBalance - pointsRequired;
      const giftImage = this.normalizeUploadUrl(product.image) ?? product.image ?? data.giftImage ?? '';
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
          giftProductId: product.id,
          giftName: product.name,
          giftImage,
        }),
      );

      // Update the correct balance field depending on role
      if (isDealerRole) {
        await manager.getRepository(Dealer).update(userId, {
          bonusPoints: newBalance,
        });
      } else {
        await this.updateUserByRole(
          userId,
          role,
          this.buildTransferBalanceUpdate(user, normalizedRole, newBalance, -pointsRequired),
          manager,
        );
      }

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
          giftImage,
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
      const canTransfer =
        (normalizedRole === UserRole.ELECTRICIAN && receiverData.role === UserRole.ELECTRICIAN) ||
        (normalizedRole === UserRole.COUNTERBOY && receiverData.role === UserRole.COUNTERBOY);
      if (!canTransfer) {
        throw new BadRequestException(
          normalizedRole === UserRole.COUNTERBOY
            ? 'Counter boys can only transfer points to another counter boy'
            : 'Points can only be transferred to another electrician',
        );
      }
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

    const giftOrders = await this.giftOrderRepository.find({
      where: { userId },
      order: { orderedAt: 'DESC' },
    });
    const giftProductIds = [...new Set(giftOrders.map((order) => order.giftProductId).filter(Boolean))];
    const giftProducts = giftProductIds.length
      ? await this.productRepository
          .createQueryBuilder('product')
          .where('product.id IN (:...ids)', { ids: giftProductIds })
          .getMany()
      : [];
    const giftProductImageById = new Map(
      giftProducts.map((product) => [
        product.id,
        this.normalizeUploadUrl(product.image) ?? product.image ?? null,
      ]),
    );
    const unmatchedGiftOrders = [...giftOrders];

    const enriched = data.map((redemption) => {
      if (redemption.type !== 'gift') return redemption;
      const directGiftProductId = (redemption as any).giftProductId;
      const directGiftName = (redemption as any).giftName;
      const directGiftImage = this.normalizeUploadUrl((redemption as any).giftImage) ?? (redemption as any).giftImage ?? null;

      const matchIndex = unmatchedGiftOrders.findIndex((order) => {
        const samePoints = Number(order.pointsUsed ?? 0) === Number(redemption.points ?? 0);
        const orderedAt = order.orderedAt ? new Date(order.orderedAt).getTime() : 0;
        const requestedAt = redemption.requestedAt ? new Date(redemption.requestedAt).getTime() : 0;
        return samePoints && Math.abs(orderedAt - requestedAt) < 5 * 60 * 1000;
      });

      const order = matchIndex >= 0 ? unmatchedGiftOrders.splice(matchIndex, 1)[0] : undefined;
      return {
        ...redemption,
        status: order?.status ?? redemption.status,
        giftName: directGiftName ?? order?.giftName ?? 'Gift redemption',
        giftImage:
          directGiftImage ??
          this.normalizeUploadUrl(order?.giftImage) ??
          giftProductImageById.get(directGiftProductId ?? order?.giftProductId ?? '') ??
          order?.giftImage ??
          null,
        giftProductId: directGiftProductId ?? order?.giftProductId ?? null,
        processedAt: order?.processedAt ?? redemption.processedAt,
        dispatchedAt: order?.dispatchedAt ?? null,
        deliveredAt: order?.deliveredAt ?? null,
        trackingNumber: order?.trackingNumber ?? null,
        courierName: order?.courierName ?? null,
        deliveryNotes: order?.deliveryNotes ?? order?.rejectionReason ?? redemption.rejectionReason ?? null,
        shippingAddress: order?.shippingAddress ?? null,
      };
    });

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Electricians (for dealer) ──────────────────────────────────────────────

  async getDealerElectricians(dealerId: string, page: number = 1, limit: number = 50, search?: string) {
    const dealer = await this.dealerRepository.findOne({ where: { id: dealerId } });
    if (!dealer) throw new NotFoundException('Dealer not found');
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
      .where(`(
        electrician.dealerId = :dealerId
        OR (electrician.dealerId IS NULL AND electrician.fallbackDealerCode = :dealerCode)
        OR (electrician.dealerId IS NULL AND RIGHT(regexp_replace(COALESCE(electrician.fallbackDealerPhone, ''), '\\D', '', 'g'), 10)
          = RIGHT(regexp_replace(COALESCE(:dealerPhone, ''), '\\D', '', 'g'), 10))
      )`, { dealerId, dealerCode: dealer.dealerCode, dealerPhone: dealer.phone });

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
    const result = await this.getDealerElectricians(dealerId, 1, 500);
    const electricians = result.data.sort((a, b) => a.name.localeCompare(b.name));

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

  async requestAccountDeletion(data: {
    name?: string; phone?: string; email?: string; reason?: string;
  }) {
    const name = String(data.name ?? '').trim().slice(0, 120);
    const phone = String(data.phone ?? '').replace(/\D/g, '').slice(-10);
    const email = String(data.email ?? '').trim().toLowerCase().slice(0, 254);
    const reason = String(data.reason ?? '').trim().slice(0, 1000);
    if (!/^\d{10}$/.test(phone) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid 10-digit mobile number or email address.');
    }

    const ticket = this.supportTicketRepository.create({
      userId: undefined,
      userName: name || 'Account deletion requester',
      userRole: undefined,
      subject: 'Public account deletion request',
      message: [
        `Phone: ${phone || 'not provided'}`,
        `Email: ${email || 'not provided'}`,
        `Reason: ${reason || 'not provided'}`,
      ].join('\n'),
      status: SupportTicketStatus.OPEN,
      priority: SupportTicketPriority.HIGH,
    });
    await this.supportTicketRepository.save(ticket);
    return {
      success: true,
      message: 'Your account deletion request has been received. SRV Support will verify your identity and confirm completion.',
      requestId: ticket.id,
    };
  }

  async createSupportTicket(userId: string, role: string, data: {
    subject: string; comment: string; photoUrl?: string; photoUrls?: string[];
  }) {
    const user = await this.getUserByRole(userId, role);
    const userRole = this.normalizeRole(role);
    const photoUrls = [...new Set((data.photoUrls ?? []).filter(Boolean))].slice(0, 5);
    if (!photoUrls.length && data.photoUrl) photoUrls.push(data.photoUrl);
    const ticket = this.supportTicketRepository.create({
      userId,
      userName: user?.name ?? 'Unknown',
      userRole,
      subject: data.subject,
      message: data.comment,
      photoUrl: data.photoUrl ?? photoUrls[0] ?? null,
      photoUrls: photoUrls.length ? photoUrls : null,
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
    return { message: 'Reply sent successfully', reply: newReply };
  }

  async deleteTicketReply(userId: string, ticketId: string, replyId: string) {
    const ticket = await this.supportTicketRepository.findOne({ where: { id: ticketId, userId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const existingReplies = ticket.replies || [];
    const decodedReplyId = decodeURIComponent(replyId);
    const nextReplies = existingReplies.filter((reply: any) => {
      const replyKey = String(reply.id ?? reply.timestamp ?? '');
      const timestampKey = String(reply.timestamp ?? '');
      return !(reply.sender === 'user' && (replyKey === decodedReplyId || timestampKey === decodedReplyId));
    });

    if (nextReplies.length === existingReplies.length) {
      throw new NotFoundException('Message not found');
    }

    await this.supportTicketRepository.update(ticketId, {
      replies: nextReplies,
    });
    return { message: 'Message deleted successfully' };
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
    const playStoreSetting = await this.settingsRepository.findOne({ where: { key: 'playStoreUrl' } });
    const appLink = playStoreSetting?.value?.trim() || 'https://play.google.com/store/apps/details?id=com.srvelectricals.app';
    const separator = appLink.includes('?') ? '&' : '?';

    return {
      code,
      link: `${appLink}${separator}ref=${encodeURIComponent(code)}`,
      channels: ['whatsapp', 'sms', 'copy'],
    };
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getMyOrders(userId: string, role?: string) {
    const normalizedRole = role ? this.normalizeRole(role) : null;
    const [giftOrders, productOrders] = await Promise.all([
      this.giftOrderRepository.find({
        where: { userId },
        order: { orderedAt: 'DESC' },
      }),
      this.productOrderRepository
        .createQueryBuilder('order')
        .where('order.userId = :userId', { userId })
        .andWhere(normalizedRole ? 'order.userRole = :userRole' : '1=1', {
          userRole: normalizedRole,
        })
        .andWhere('(order.paymentMethod <> :razorpay OR order.paymentStatus IN (:...visiblePaymentStatuses))', {
          razorpay: 'razorpay',
          visiblePaymentStatuses: ['paid', 'failed'],
        })
        .orderBy('order.orderedAt', 'DESC')
        .getMany(),
    ]);

    const giftProductIds = [...new Set(giftOrders.map((order) => order.giftProductId).filter(Boolean))];
    const giftProducts = giftProductIds.length
      ? await this.productRepository
          .createQueryBuilder('product')
          .where('product.id IN (:...ids)', { ids: giftProductIds })
          .getMany()
      : [];
    const giftProductImageById = new Map(
      giftProducts.map((product) => [
        product.id,
        this.normalizeUploadUrl(product.image) ?? product.image ?? null,
      ]),
    );

    const giftMapped = giftOrders.map(o => {
      const giftImage = this.normalizeUploadUrl(o.giftImage) ?? giftProductImageById.get(o.giftProductId) ?? o.giftImage ?? null;
      return ({
      id: o.id,
      orderCode: getPublicOrderCode(o.id),
      type: 'gift' as const,
      status: o.status,
      title: o.giftName,
      productName: o.giftName,
      productImage: giftImage,
      imageUrl: giftImage,
      quantity: 1,
      price: o.pointsUsed,
      total: o.pointsUsed,
      userId: o.userId,
      userName: o.userName,
      points: o.pointsUsed,
      orderedAt: o.orderedAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      dispatchedAt: o.dispatchedAt?.toISOString() ?? null,
      shippingAddress: o.shippingAddress ?? null,
      trackingNumber: o.trackingNumber ?? null,
      courierName: o.courierName ?? null,
      paymentStatus: 'paid',
      deliveryNotes: o.deliveryNotes ?? null,
      rejectionReason: o.rejectionReason ?? null,
      createdAt: o.orderedAt.toISOString(),
    });
    });

    const productMapped = productOrders.map(o => {
      const estimatedDeliveryAt = o.estimatedDeliveryAt ?? this.estimateDeliveryDate(o.paidAt ?? o.orderedAt ?? new Date());
      const status = String(o.status ?? '').toLowerCase();
      const canCancel =
        ['pending', 'approved', 'out_for_delivery'].includes(status) &&
        this.isWithinHours(o.orderedAt, 24);
      const canReturn =
        status === ProductOrderStatus.DELIVERED &&
        this.isWithinHours(o.deliveredAt, 24);
      const canRefund =
        o.paymentStatus === 'paid' &&
        !['refunded', 'rejected'].includes(status) &&
        !['requested', 'completed'].includes(String(o.refundStatus ?? '').toLowerCase());
      return ({
      id: o.id,
      orderCode: getPublicOrderCode(o.id),
      type: 'product' as const,
      status: o.status,
      statusLabel: PRODUCT_ORDER_STATUS_LABELS[o.status],
      title: o.productName,
      productName: o.productName,
      productImage: this.normalizeUploadUrl(o.productImage) ?? o.productImage ?? null,
      imageUrl: this.normalizeUploadUrl(o.productImage) ?? o.productImage ?? null,
      quantity: o.quantity,
      price: parseFloat(o.price.toString()),
      total: parseFloat(o.price.toString()) * o.quantity,
      userId: o.userId,
      userName: o.userName,
      points: parseFloat(o.price.toString()) * o.quantity,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      orderedAt: o.orderedAt?.toISOString() ?? null,
      paidAt: o.paidAt?.toISOString() ?? null,
      estimatedDeliveryAt: estimatedDeliveryAt.toISOString(),
      dispatchedAt: o.dispatchedAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null,
      updatedAt: o.updatedAt?.toISOString() ?? null,
      shippingAddress: o.shippingAddress ?? null,
      trackingNumber: o.trackingNumber ?? null,
      courierName: o.courierName ?? null,
      paymentMethod: o.paymentMethod ?? null,
      paymentStatus: o.paymentStatus ?? null,
      refundStatus: o.refundStatus ?? null,
      refundMessage: o.refundMessage ?? null,
      rejectionReason: o.rejectionReason ?? null,
      deliveryNotes: o.deliveryNotes ?? null,
      cancelReason: o.cancelReason ?? null,
      returnReason: o.returnReason ?? null,
      refundReason: o.refundReason ?? null,
      customerActionAt: o.customerActionAt?.toISOString() ?? null,
      canCancel,
      canReturn,
      canRefund,
      createdAt: o.orderedAt.toISOString(),
    });
    });

    return [...giftMapped, ...productMapped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // ── Rating ─────────────────────────────────────────────────────────────────

  async submitRating(userId: string, role: string | undefined, rating: number, review?: string) {

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    const normalizedRequestRole = this.normalizeRole(role ?? UserRole.USER);
    const existingUser = await this.getUserByRole(userId, normalizedRequestRole)
      ?? await this.getUserByRole(userId, UserRole.DEALER)
      ?? await this.getUserByRole(userId, UserRole.ELECTRICIAN)
      ?? await this.getUserByRole(userId, UserRole.USER)
      ?? await this.getUserByRole(userId, UserRole.COUNTERBOY);
    const userRole = existingUser
      ? normalizedRequestRole
      : UserRole.USER;

    await this.dataSource.query(
      `
        INSERT INTO "app_ratings" ("userId", "userRole", "rating", "review")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("userId")
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
