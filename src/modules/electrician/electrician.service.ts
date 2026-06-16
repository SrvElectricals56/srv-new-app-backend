import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateElectricianDto } from './dto/create-electrician.dto';
import { UpdateElectricianDto } from './dto/update-electrician.dto';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { Scan } from '../../database/entities/scan.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder } from '../../database/entities/product-order.entity';
import { AppActivityEvent, AppActivityEventType } from '../../database/entities/app-activity-event.entity';
import { UserStatus, MemberTier, UserRole } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';
import { CrossRolePhoneService } from '../../common/services/cross-role-phone.service';

@Injectable()
export class ElectricianService {
  constructor(
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(ProductCartItem)
    private cartRepository: Repository<ProductCartItem>,
    @InjectRepository(ProductOrder)
    private orderRepository: Repository<ProductOrder>,
    @InjectRepository(AppActivityEvent)
    private appActivityRepository: Repository<AppActivityEvent>,
    private readonly tierService: TierService,
    private readonly crossRolePhoneService: CrossRolePhoneService,
  ) {}

  private async hashPassword(password?: string) {
    const trimmed = password?.trim();
    if (!trimmed) return null;
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(trimmed, salt);
  }

  private serialize(electrician: Electrician) {
    const {
      passwordHash,
      dealer,
      ...rest
    } = electrician as Electrician & { dealer?: Dealer | null };
    return {
      ...rest,
      ...(dealer
        ? {
            dealer: (() => {
              const { passwordHash: dealerPasswordHash, ...dealerRest } = dealer;
              return {
                ...dealerRest,
                hasPassword: Boolean(dealerPasswordHash),
              };
            })(),
          }
        : {}),
      hasPassword: Boolean(passwordHash),
      appInstalled: Boolean((electrician as any).appInstalled),
      firstAppLoginAt: (electrician as any).firstAppLoginAt ?? null,
    };
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

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.electricianRepository.query('SELECT to_regclass($1) AS name', [`public.${tableName}`]);
    return Boolean(rows?.[0]?.name);
  }

  private async generateNextElectricianCodeForDealer(dealerId: string): Promise<string> {
    const dealer = await this.dealerRepository.findOne({
      where: { id: dealerId },
      select: ['id', 'dealerCode'],
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    if (!dealer.dealerCode?.trim()) {
      throw new BadRequestException('Selected dealer does not have a dealer code');
    }

    const prefix = `${dealer.dealerCode.trim().toUpperCase()}-`;
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

  private async resolveElectricianCode(params: {
    electricianCode?: string | null;
    dealerId?: string | null;
    phone?: string | null;
  }): Promise<string> {
    const manualCode = this.normalizeElectricianCode(params.electricianCode);
    if (manualCode) {
      return manualCode;
    }

    if (params.dealerId) {
      return this.generateNextElectricianCodeForDealer(params.dealerId);
    }

    return this.buildFallbackElectricianCode(params.phone);
  }

  async create(createElectricianDto: CreateElectricianDto) {
    await this.crossRolePhoneService.assertPhoneAvailableForRole(
      createElectricianDto.phone,
      'electrician',
    );

    const data: any = { ...createElectricianDto };
    if (!data.dealerId || data.dealerId.trim() === '') {
      data.dealerId = null;
    }
    if (!data.status) {
      data.status = UserStatus.ACTIVE;
    }
    data.electricianCode = await this.resolveElectricianCode({
      electricianCode: data.electricianCode,
      dealerId: data.dealerId,
      phone: data.phone,
    });

    const existingCode = await this.electricianRepository.findOne({
      where: { electricianCode: data.electricianCode },
    });
    if (existingCode) {
      throw new ConflictException('Electrician with this code already exists');
    }

    // Set initial tier based on points (if provided)
    const points = Number(data.totalPoints ?? 0);
    data.tier = this.tierService.calculateElectricianTier(points);

    const electrician = this.electricianRepository.create(data);
    const saved = (await this.electricianRepository.save(electrician as any)) as unknown as Electrician;

    // If linked to a dealer, sync dealer's tier
    if (saved.dealerId) {
      await this.tierService.syncDealerTier(saved.dealerId);
    }

    return saved;
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: UserStatus,
    tier?: MemberTier,
    state?: string,
    city?: string,
    dealerId?: string,
    subCategory?: string,
    bankLinked?: boolean,
    appInstalled?: boolean,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.electricianRepository
      .createQueryBuilder('electrician')
      .leftJoinAndSelect('electrician.dealer', 'dealer');

    if (search) {
      queryBuilder.andWhere(
        '(electrician.name ILIKE :search OR electrician.phone ILIKE :search OR electrician.city ILIKE :search OR electrician.electricianCode ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status) {
      queryBuilder.andWhere('electrician.status = :status', { status });
    }

    if (tier) {
      queryBuilder.andWhere('electrician.tier = :tier', { tier });
    }

    if (state) {
      queryBuilder.andWhere('electrician.state = :state', { state });
    }

    if (city) {
      queryBuilder.andWhere('electrician.city = :city', { city });
    }

    if (dealerId) {
      queryBuilder.andWhere('electrician.dealerId = :dealerId', { dealerId });
    }

    if (subCategory) {
      queryBuilder.andWhere('electrician.subCategory = :subCategory', { subCategory });
    }

    if (bankLinked !== undefined) {
      queryBuilder.andWhere('electrician.bankLinked = :bankLinked', { bankLinked });
    }

    if (appInstalled !== undefined) {
      queryBuilder.andWhere('electrician.appInstalled = :appInstalled', { appInstalled });
    }

    if (dateFrom) {
      queryBuilder.andWhere('electrician.joinedDate >= :dateFrom', { dateFrom: new Date(dateFrom) });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('electrician.joinedDate <= :dateTo', { dateTo: to });
    }

    queryBuilder
      .orderBy('electrician.joinedDate', 'DESC')
      .skip(skip)
      .take(limit);

    const [rawData, total] = await queryBuilder.getManyAndCount();

    const data = rawData.map(e => this.serialize({
      ...e,
      dealerName: (e as any).dealer?.name ?? null,
    } as Electrician & { dealerName?: string | null }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const electrician = await this.electricianRepository.findOne({
      where: { id },
      relations: ['dealer'],
    });

    if (!electrician) {
      throw new NotFoundException('Electrician not found');
    }

    return this.serialize({
      ...electrician,
      dealerName: (electrician as any).dealer?.name ?? null,
    } as Electrician & { dealerName?: string | null });
  }

  async update(id: string, updateElectricianDto: UpdateElectricianDto) {
    const electrician = await this.findOne(id);

    if (updateElectricianDto.phone && updateElectricianDto.phone !== electrician.phone) {
      await this.crossRolePhoneService.assertPhoneAvailableForRole(
        updateElectricianDto.phone,
        'electrician',
        { role: 'electrician', id },
      );
    }

    const passwordHash = await this.hashPassword(updateElectricianDto.password);
    const data: any = { ...updateElectricianDto };
    delete data.password;
    if (data.dealerId !== undefined && (!data.dealerId || data.dealerId.trim() === '')) {
      data.dealerId = null;
    }
    if (data.electricianCode !== undefined) {
      const normalizedCode = this.normalizeElectricianCode(data.electricianCode);
      if (!normalizedCode) {
        delete data.electricianCode;
      } else {
        if (normalizedCode !== electrician.electricianCode) {
          const existingCode = await this.electricianRepository.findOne({
            where: { electricianCode: normalizedCode },
          });
          if (existingCode && existingCode.id !== electrician.id) {
            throw new ConflictException('Electrician with this code already exists');
          }
        }
        data.electricianCode = normalizedCode;
      }
    }

    // Auto-recalculate tier when totalPoints changes — ignore any manually passed tier
    if (data.totalPoints !== undefined) {
      const points = Number(data.totalPoints);
      data.tier = this.tierService.calculateElectricianTier(points);
      if (data.walletBalance === undefined) {
        data.walletBalance = points;
      }
    } else if (data.walletBalance !== undefined) {
      // walletBalance changed but totalPoints not — sync totalPoints too
      data.totalPoints = Number(data.walletBalance);
      data.tier = this.tierService.calculateElectricianTier(data.totalPoints);
    }

    if (passwordHash) {
      data.passwordHash = passwordHash;
    }

    const oldDealerId = electrician.dealerId;
    await this.electricianRepository.update(id, data);
    if (passwordHash) {
      await this.electricianRepository.increment({ id }, 'tokenVersion', 1);
    }

    // Sync dealer tier if dealer assignment changed
    const newDealerId = data.dealerId !== undefined ? data.dealerId : oldDealerId;
    if (oldDealerId !== newDealerId) {
      if (oldDealerId) await this.tierService.syncDealerTier(oldDealerId);
      if (newDealerId) await this.tierService.syncDealerTier(newDealerId);
    } else if (newDealerId) {
      await this.tierService.syncDealerTier(newDealerId);
    }

    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.electricianRepository.update(id, { status });
    return this.findOne(id);
  }

  async remove(id: string) {
    const electrician = await this.electricianRepository.findOne({ where: { id } });
    if (!electrician) {
      throw new NotFoundException('Electrician not found');
    }
    const dealerId = electrician.dealerId;

    await this.electricianRepository.remove(electrician);

    // Sync dealer tier after removal
    if (dealerId) {
      await this.tierService.syncDealerTier(dealerId);
    }

    return { message: 'Electrician deleted successfully' };
  }

  async getElectricianScans(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [rawData, total] = await this.scanRepository.findAndCount({
      where: { userId: id },
      skip,
      take: limit,
      order: { scannedAt: 'DESC' },
    });
    const data = rawData.map(s => ({
      ...s,
      scannedAt: s.scannedAt instanceof Date ? s.scannedAt.toISOString() : s.scannedAt,
    }));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getElectricianWallet(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.walletRepository.findAndCount({
      where: { userId: id },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getElectricianActivity(id: string) {
    const electrician = await this.findOne(id);
    const role = UserRole.ELECTRICIAN;
    const [hasCartTable, hasOrderTable] = await Promise.all([
      this.tableExists('product_cart_items'),
      this.tableExists('product_orders'),
    ]);

    const [scanStats, cartStats, orderStats, walletStats, appEventStats, topScans, topViewedProducts, cartItems, orders, wallets, recentScans, appEvents] = await Promise.all([
      this.scanRepository.count({ where: { userId: id, role } }),
      hasCartTable ? this.cartRepository.count({ where: { userId: id, userRole: role } }) : Promise.resolve(0),
      hasOrderTable ? this.orderRepository.count({ where: { userId: id, userRole: role } }) : Promise.resolve(0),
      this.walletRepository.count({ where: { userId: id, userRole: role } }),
      this.appActivityRepository.count({ where: { userId: id, userRole: role } }),
      this.scanRepository
        .createQueryBuilder('scan')
        .leftJoin('scan.product', 'product')
        .select('scan.productId', 'productId')
        .addSelect('scan.productName', 'productName')
        .addSelect('product.category', 'category')
        .addSelect('COUNT(*)', 'scanCount')
        .addSelect('COALESCE(SUM(scan.points), 0)', 'pointsEarned')
        .where('scan.userId = :id', { id })
        .andWhere('scan.role = :role', { role })
        .groupBy('scan.productId')
        .addGroupBy('scan.productName')
        .addGroupBy('product.category')
        .orderBy('COUNT(*)', 'DESC')
        .limit(8)
        .getRawMany(),
      this.appActivityRepository
        .createQueryBuilder('event')
        .select('event.productId', 'productId')
        .addSelect('event.productName', 'productName')
        .addSelect('event.productCategory', 'category')
        .addSelect('COUNT(*)', 'viewCount')
        .addSelect('COALESCE(SUM(event.durationMs), 0)', 'durationMs')
        .where('event.userId = :id', { id })
        .andWhere('event.userRole = :role', { role })
        .andWhere('event.eventType = :eventType', { eventType: AppActivityEventType.PRODUCT_VIEW })
        .andWhere('event.productId IS NOT NULL')
        .groupBy('event.productId')
        .addGroupBy('event.productName')
        .addGroupBy('event.productCategory')
        .orderBy('COUNT(*)', 'DESC')
        .limit(8)
        .getRawMany(),
      hasCartTable ? this.cartRepository.find({
        where: { userId: id, userRole: role },
        order: { updatedAt: 'DESC' },
        take: 8,
      }) : Promise.resolve([]),
      hasOrderTable ? this.orderRepository.find({
        where: { userId: id, userRole: role },
        order: { orderedAt: 'DESC' },
        take: 8,
      }) : Promise.resolve([]),
      this.walletRepository.find({
        where: { userId: id, userRole: role },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.scanRepository.find({
        where: { userId: id, role },
        order: { scannedAt: 'DESC' },
        take: 8,
      }),
      this.appActivityRepository.find({
        where: { userId: id, userRole: role },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
    ]);

    const cartInterest = new Map<string, any>();
    for (const item of cartItems) {
      cartInterest.set(item.productId, {
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        cartQuantity: Number(item.quantity ?? 0),
        cartValue: Number(item.price ?? 0) * Number(item.quantity ?? 0),
      });
    }

    const orderInterest = new Map<string, any>();
    for (const order of orders) {
      const current = orderInterest.get(order.productId) ?? {
        productId: order.productId,
        productName: order.productName,
        productImage: order.productImage,
        orderQuantity: 0,
        orderValue: 0,
        lastOrderAt: order.orderedAt,
      };
      current.orderQuantity += Number(order.quantity ?? 0);
      current.orderValue += Number(order.price ?? 0) * Number(order.quantity ?? 0);
      orderInterest.set(order.productId, current);
    }

    const products = topScans.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      category: row.category ?? '—',
      scanCount: Number(row.scanCount ?? 0),
      pointsEarned: Number(row.pointsEarned ?? 0),
      cartQuantity: Number(cartInterest.get(row.productId)?.cartQuantity ?? 0),
      orderQuantity: Number(orderInterest.get(row.productId)?.orderQuantity ?? 0),
      intentScore:
        Number(row.scanCount ?? 0) * 3 +
        Number(cartInterest.get(row.productId)?.cartQuantity ?? 0) * 5 +
        Number(orderInterest.get(row.productId)?.orderQuantity ?? 0) * 8,
    }));

    const productsById = new Map(products.map((product) => [product.productId, product]));

    for (const row of topViewedProducts) {
      const existing = productsById.get(row.productId);
      if (existing) {
        (existing as any).viewCount = Number(row.viewCount ?? 0);
        (existing as any).durationMs = Number(row.durationMs ?? 0);
        existing.intentScore += Number(row.viewCount ?? 0) * 2 + Math.floor(Number(row.durationMs ?? 0) / 30000);
      } else {
        const product = {
          productId: row.productId,
          productName: row.productName,
          category: row.category ?? '—',
          scanCount: 0,
          pointsEarned: 0,
          cartQuantity: 0,
          orderQuantity: 0,
          viewCount: Number(row.viewCount ?? 0),
          durationMs: Number(row.durationMs ?? 0),
          intentScore: Number(row.viewCount ?? 0) * 2 + Math.floor(Number(row.durationMs ?? 0) / 30000),
        } as any;
        products.push(product);
        productsById.set(product.productId, product);
      }
    }

    for (const item of [...cartInterest.values(), ...orderInterest.values()]) {
      if (productsById.has(item.productId)) continue;
      const product = {
        productId: item.productId,
        productName: item.productName,
        category: '—',
        scanCount: 0,
        pointsEarned: 0,
        cartQuantity: Number(item.cartQuantity ?? 0),
        orderQuantity: Number(item.orderQuantity ?? 0),
        intentScore: Number(item.cartQuantity ?? 0) * 5 + Number(item.orderQuantity ?? 0) * 8,
      };
      products.push(product);
      productsById.set(product.productId, product);
    }

    products.sort((a, b) => b.intentScore - a.intentScore);

    const timeline = [
      ...recentScans.map((scan) => ({
        id: scan.id,
        type: 'scan',
        title: `Scanned ${scan.productName}`,
        detail: `${scan.points} points earned${scan.location ? ` · ${scan.location}` : ''}`,
        productName: scan.productName,
        occurredAt: scan.scannedAt,
      })),
      ...cartItems.map((item) => ({
        id: item.id,
        type: 'cart',
        title: `Added ${item.productName} to cart`,
        detail: `${item.quantity} qty · ₹${Number(item.price ?? 0).toLocaleString('en-IN')}`,
        productName: item.productName,
        occurredAt: item.updatedAt,
      })),
      ...orders.map((order) => ({
        id: order.id,
        type: 'order',
        title: `Ordered ${order.productName}`,
        detail: `${order.quantity} qty · ${order.status}`,
        productName: order.productName,
        occurredAt: order.orderedAt,
      })),
      ...wallets.map((wallet) => ({
        id: wallet.id,
        type: 'wallet',
        title: `${wallet.type === 'credit' ? 'Credit' : 'Debit'} ${wallet.source}`,
        detail: `₹${Number(wallet.amount ?? 0).toLocaleString('en-IN')} · ${wallet.description ?? 'Wallet activity'}`,
        occurredAt: wallet.createdAt,
      })),
      ...appEvents.map((event) => ({
        id: event.id,
        type: event.eventType,
        title: event.eventLabel,
        detail: [
          event.screen ? `Screen: ${event.screen}` : '',
          event.productName ? `Product: ${event.productName}` : '',
          event.durationMs ? `Time: ${Math.round(event.durationMs / 1000)}s` : '',
          event.metadata && typeof event.metadata === 'object' && 'action' in event.metadata ? `Action: ${String(event.metadata.action).replace(/_/g, ' ')}` : '',
        ].filter(Boolean).join(' · ') || 'App touch activity',
        productName: event.productName ?? undefined,
        occurredAt: event.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.occurredAt as any).getTime() - new Date(a.occurredAt as any).getTime())
      .slice(0, 30);

    return {
      user: electrician,
      summary: {
        scans: scanStats,
        cartItems: cartStats,
        productOrders: orderStats,
        walletTransactions: walletStats,
        appEvents: appEventStats,
        favoriteProduct: products[0]?.productName ?? 'No product signal yet',
        lastActivityAt: timeline[0]?.occurredAt ?? null,
      },
      productInterests: products.slice(0, 10),
      recentTimeline: timeline,
      note: 'Product interest is calculated from scans, cart items, orders, wallet activity, catalog downloads, and app touch activity already stored in the database.',
    };
  }

  async importMany(records: any[]) {
    let created = 0, updated = 0, failed = 0, errors: string[] = [];

    for (const record of records) {
      try {
        if (!record.name?.trim() || !record.phone?.trim()) {
          failed++;
          errors.push(`Row missing name or phone: ${JSON.stringify(record)}`);
          continue;
        }

        const rawPhone = String(record.phone).trim();
        const phone = rawPhone.replace(/\D/g, '').slice(0, 10);
        if (!phone || phone.length < 10) {
          failed++;
          errors.push(`Invalid phone number: ${rawPhone}`);
          continue;
        }

        record.phone = phone;
        let existing = await this.electricianRepository.findOne({ where: { phone } });

        if (existing) {
          const { id, joinedDate, ...updateData } = record;
          if (updateData.totalPoints !== undefined) {
            const points = Number(updateData.totalPoints);
            updateData.tier = this.tierService.calculateElectricianTier(points);
          }
          await this.electricianRepository.update(existing.id, updateData);
          updated++;
        } else {
          await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, 'electrician');
          const data: any = { ...record };
          if (!data.dealerId || data.dealerId.trim() === '') data.dealerId = null;
          data.electricianCode = await this.resolveElectricianCode({
            electricianCode: data.electricianCode,
            dealerId: data.dealerId,
            phone: data.phone,
          });
          const points = Number(data.totalPoints ?? 0);
          data.tier = this.tierService.calculateElectricianTier(points);
          const entity = this.electricianRepository.create(data);
          await this.electricianRepository.save(entity as any);
          if (data.dealerId) await this.tierService.syncDealerTier(data.dealerId);
          created++;
        }
      } catch (err: any) {
        failed++;
        errors.push(`Row ${record.name ?? record.phone}: ${err.message}`);
      }
    }

    return { created, updated, failed, errors: errors.slice(0, 20), total: records.length };
  }

  async getDistinctStates(): Promise<{ states: string[] }> {
    const rows = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('DISTINCT electrician.state', 'state')
      .where('electrician.state IS NOT NULL')
      .andWhere(`TRIM(electrician.state) <> ''`)
      .orderBy('electrician.state', 'ASC')
      .getRawMany();
    return {
      states: Array.from(
        new Set(
          rows
            .map((r) => String(r.state ?? '').trim())
            .filter((state) => state !== '' && state !== '?'),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    };
  }

  async getDistinctCities(state?: string): Promise<{ cities: string[] }> {
    const query = this.electricianRepository
      .createQueryBuilder('electrician')
      .select('DISTINCT electrician.city', 'city')
      .where('electrician.city IS NOT NULL')
      .andWhere(`TRIM(electrician.city) <> ''`);
    if (state) {
      query.andWhere('electrician.state = :state', { state });
    }
    const rows = await query.orderBy('electrician.city', 'ASC').getRawMany();
    return {
      cities: Array.from(
        new Set(
          rows
            .map((r) => String(r.city ?? '').trim())
            .filter((city) => city !== '' && city !== '?'),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    };
  }

  async getDistinctCategories(): Promise<{ categories: string[] }> {
    const rows = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('DISTINCT electrician.subCategory', 'subCategory')
      .where('electrician.subCategory IS NOT NULL')
      .orderBy('electrician.subCategory', 'ASC')
      .getRawMany();
    return { categories: rows.map(r => r.subCategory).filter(Boolean) };
  }

  async getTop(from: string, to: string, sortBy: string = 'points', limit: number = 10) {
    const now = new Date();
    const fallbackFrom = new Date(now);
    fallbackFrom.setDate(fallbackFrom.getDate() - 30);
    fallbackFrom.setHours(0, 0, 0, 0);

    const fromDate = from ? new Date(from) : fallbackFrom;
    const toDate = to ? new Date(to) : now;
    if (Number.isNaN(fromDate.getTime())) {
      fromDate.setTime(fallbackFrom.getTime());
    }
    if (Number.isNaN(toDate.getTime())) {
      toDate.setTime(now.getTime());
    }
    toDate.setHours(23, 59, 59, 999);

    const [scanResults, redemptionResults] = await Promise.all([
      this.scanRepository
        .createQueryBuilder('scan')
        .select('scan.userId', 'userId')
        .addSelect('COUNT(*)', 'periodScans')
        .addSelect('COALESCE(SUM(scan.points), 0)', 'periodPoints')
        .where('scan.role = :role', { role: 'electrician' })
        .andWhere('scan.scannedAt >= :from', { from: fromDate })
        .andWhere('scan.scannedAt <= :to', { to: toDate })
        .groupBy('scan.userId')
        .getRawMany(),
      this.walletRepository
        .createQueryBuilder('wallet')
        .select('wallet.userId', 'userId')
        .addSelect('COUNT(*)', 'periodRedemptions')
        .where('wallet.userRole = :role', { role: 'electrician' })
        .andWhere('wallet.type = :type', { type: 'debit' })
        .andWhere('wallet.source = :source', { source: 'redemption' })
        .andWhere('wallet.createdAt >= :from', { from: fromDate })
        .andWhere('wallet.createdAt <= :to', { to: toDate })
        .groupBy('wallet.userId')
        .getRawMany(),
    ]);

    const scanMap = new Map(scanResults.map(r => [r.userId, r]));
    const redemptionMap = new Map(redemptionResults.map(r => [r.userId, r]));
    const allUserIds = new Set([...scanMap.keys(), ...redemptionMap.keys()]);

    if (allUserIds.size === 0) return [];

    const electricians = await this.electricianRepository
      .createQueryBuilder('e')
      .where('e.id IN (:...ids)', { ids: [...allUserIds] })
      .andWhere('e.status = :status', { status: 'active' })
      .getMany();

    const result = electricians.map(e => {
      const s = scanMap.get(e.id);
      const r = redemptionMap.get(e.id);
      return {
        id: e.id,
        name: e.name,
        phone: e.phone,
        electricianCode: e.electricianCode,
        city: e.city,
        state: e.state,
        tier: e.tier,
        walletBalance: e.walletBalance,
        totalPoints: e.totalPoints,
        totalScans: e.totalScans,
        totalRedemptions: e.totalRedemptions,
        periodPoints: s ? Number(s.periodPoints) : 0,
        periodScans: s ? Number(s.periodScans) : 0,
        periodRedemptions: r ? Number(r.periodRedemptions) : 0,
      };
    });

    result.sort((a, b) => {
      if (sortBy === 'scans') return b.periodScans - a.periodScans;
      if (sortBy === 'redemptions') return b.periodRedemptions - a.periodRedemptions;
      return b.periodPoints - a.periodPoints;
    });

    return result.slice(0, limit);
  }

  async getTierCounts() {
    const rows = await this.electricianRepository
      .createQueryBuilder('electrician')
      .select('electrician.tier', 'tier')
      .addSelect('COUNT(*)', 'count')
      .groupBy('electrician.tier')
      .getRawMany();

    const result: Record<string, number> = { Silver: 0, Gold: 0, Platinum: 0, Diamond: 0 };
    for (const row of rows) {
      result[row.tier] = parseInt(row.count, 10);
    }
    return result;
  }
}
