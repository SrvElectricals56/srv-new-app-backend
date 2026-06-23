import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { Dealer } from '../../database/entities/dealer.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { Scan } from '../../database/entities/scan.entity';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder } from '../../database/entities/product-order.entity';
import { AppActivityEvent, AppActivityEventType } from '../../database/entities/app-activity-event.entity';
import { UserStatus, MemberTier, UserRole } from '../../common/enums';
import { TierService } from '../../common/services/tier.service';
import { CrossRolePhoneService } from '../../common/services/cross-role-phone.service';

@Injectable()
export class DealerService {
  constructor(
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
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

  private serialize(dealer: Dealer) {
    const { passwordHash, electricians, ...rest } = dealer as Dealer & { electricians?: Electrician[] };
    return {
      ...rest,
      ...(electricians
        ? {
            electricians: electricians.map((electrician) => {
              const { passwordHash: electricianPasswordHash, ...electricianRest } = electrician;
              return {
                ...electricianRest,
                hasPassword: Boolean(electricianPasswordHash),
                appInstalled: Boolean((electrician as any).appInstalled),
                firstAppLoginAt: (electrician as any).firstAppLoginAt ?? null,
              };
            }),
          }
        : {}),
      hasPassword: Boolean(passwordHash),
      appInstalled: Boolean((dealer as any).appInstalled),
      firstAppLoginAt: (dealer as any).firstAppLoginAt ?? null,
    };
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.dealerRepository.query('SELECT to_regclass($1) AS name', [`public.${tableName}`]);
    return Boolean(rows?.[0]?.name);
  }

  private async ensureSubDealerSchema() {
    await this.electricianRepository.query(
      'ALTER TABLE "electricians" ADD COLUMN IF NOT EXISTS "fallbackDealerName" character varying',
    );
    await this.electricianRepository.query(
      'ALTER TABLE "electricians" ADD COLUMN IF NOT EXISTS "fallbackDealerPhone" character varying',
    );
    await this.dealerRepository.query(`
      CREATE TABLE IF NOT EXISTS "sub_dealers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone" character varying NOT NULL UNIQUE,
        "name" character varying NOT NULL DEFAULT 'SRV Dealer',
        "district" character varying,
        "pincode" character varying,
        "electricianCount" integer NOT NULL DEFAULT 0,
        "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
        "lastSeenAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async getSubDealers(page = 1, limit = 20, search?: string) {
    await this.ensureSubDealerSchema();
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(100, Math.max(1, limit || 20));
    const term = search?.trim() ? `%${search.trim()}%` : null;
    const where = term
      ? 'WHERE sd."phone" ILIKE $1 OR sd."name" ILIKE $1 OR COALESCE(sd."district", \'\') ILIKE $1'
      : '';
    const values: any[] = term ? [term] : [];
    const countRows = await this.dealerRepository.query(
      `SELECT COUNT(*)::int AS total FROM "sub_dealers" sd ${where}`,
      values,
    );
    const data = await this.dealerRepository.query(
      `SELECT sd."id", sd."phone", 'SRV Dealer' AS "name", sd."district", sd."pincode",
              sd."electricianCount", sd."firstSeenAt", sd."lastSeenAt"
       FROM "sub_dealers" sd ${where}
       ORDER BY sd."lastSeenAt" DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, safeLimit, (safePage - 1) * safeLimit],
    );
    return { data, total: Number(countRows[0]?.total ?? 0), page: safePage, limit: safeLimit };
  }

  async getSubDealerElectricians(id: string) {
    await this.ensureSubDealerSchema();
    const subDealerRows = await this.dealerRepository.query(
      'SELECT "phone" FROM "sub_dealers" WHERE "id" = $1',
      [id],
    );
    const phone = subDealerRows?.[0]?.phone;
    if (!phone) {
      throw new NotFoundException('Sub dealer not found');
    }

    const data = await this.electricianRepository.query(
      `SELECT "id", "name", "phone", "electricianCode", "subCategory", "tier", "status",
              "city", "district", "state", "pincode", "totalPoints", "totalScans", "joinedDate"
       FROM "electricians"
       WHERE "fallbackDealerPhone" = $1
       ORDER BY "joinedDate" DESC NULLS LAST, "createdAt" DESC
       LIMIT 500`,
      [phone],
    );

    return { data, total: data.length, phone };
  }

  async create(createDealerDto: CreateDealerDto) {
    await this.crossRolePhoneService.assertPhoneAvailableForRole(createDealerDto.phone, 'dealer');

    const existingCode = await this.dealerRepository.findOne({
      where: { dealerCode: createDealerDto.dealerCode },
    });

    if (existingCode) {
      throw new ConflictException('Dealer with this code already exists');
    }

    // New dealer starts with 0 electricians → Silver tier
    const data: any = { ...createDealerDto };
    data.electricianCount = 0;
    data.tier = MemberTier.SILVER;

    const dealer = this.dealerRepository.create(data);
    return this.dealerRepository.save(dealer);
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: UserStatus,
    tier?: MemberTier,
    state?: string,
    city?: string,
    bankLinked?: boolean,
    appInstalled?: boolean,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.dealerRepository.createQueryBuilder('dealer');

    if (search) {
      queryBuilder.andWhere(
        '(dealer.name ILIKE :search OR dealer.phone ILIKE :search OR dealer.town ILIKE :search OR dealer.dealerCode ILIKE :search OR dealer.contactPerson ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status) {
      queryBuilder.andWhere('dealer.status = :status', { status });
    }

    if (tier) {
      queryBuilder.andWhere('dealer.tier = :tier', { tier });
    }

    if (state) {
      queryBuilder.andWhere('dealer.state = :state', { state });
    }

    if (city) {
      queryBuilder.andWhere('dealer.town = :city', { city });
    }

    if (bankLinked !== undefined) {
      queryBuilder.andWhere('dealer.bankLinked = :bankLinked', { bankLinked });
    }

    if (appInstalled !== undefined) {
      queryBuilder.andWhere('dealer.appInstalled = :appInstalled', { appInstalled });
    }

    if (dateFrom) {
      queryBuilder.andWhere('dealer.joinedDate >= :dateFrom', { dateFrom: new Date(dateFrom) });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('dealer.joinedDate <= :dateTo', { dateTo: to });
    }

    queryBuilder.orderBy('dealer.joinedDate', 'DESC').skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: data.map((dealer) => this.serialize(dealer)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const dealer = await this.dealerRepository.findOne({
      where: { id },
      relations: ['electricians'],
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    return this.serialize(dealer);
  }

  async update(id: string, updateDealerDto: UpdateDealerDto) {
    const dealer = await this.findOne(id);

    if (updateDealerDto.phone && updateDealerDto.phone !== dealer.phone) {
      await this.crossRolePhoneService.assertPhoneAvailableForRole(updateDealerDto.phone, 'dealer', {
        role: 'dealer',
        id,
      });
    }

    // Strip tier from update payload — tier is always auto-calculated
    const passwordHash = await this.hashPassword(updateDealerDto.password);
    const {
      tier: _ignoredTier,
      electricianCount: _ignoredCount,
      password: _ignoredPassword,
      ...safeData
    } = updateDealerDto as any;

    if (passwordHash) {
      safeData.passwordHash = passwordHash;
      await this.dealerRepository.update(id, safeData);
      await this.dealerRepository.increment({ id }, 'tokenVersion', 1);
    } else {
      await this.dealerRepository.update(id, safeData);
    }

    // Re-sync tier from actual electrician count
    await this.tierService.syncDealerTier(id);

    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus, rejectionReason?: string) {
    const normalizedReason = rejectionReason?.trim();
    await this.dealerRepository.update(id, {
      status,
      rejectionReason:
        status === UserStatus.INACTIVE ? normalizedReason || 'Rejected by admin' : null,
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const dealer = await this.dealerRepository.findOne({ where: { id } });
    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }
    await this.dealerRepository.remove(dealer);
    return { message: 'Dealer deleted successfully' };
  }

  async getDealerElectricians(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.electricianRepository.findAndCount({
      where: { dealerId: id },
      skip,
      take: limit,
      order: { joinedDate: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDealerWallet(id: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.walletRepository.findAndCount({
      where: { userId: id },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDealerActivity(id: string) {
    const dealer = await this.findOne(id);
    const role = UserRole.DEALER;
    const [hasCartTable, hasOrderTable] = await Promise.all([
      this.tableExists('product_cart_items'),
      this.tableExists('product_orders'),
    ]);

    const [scanStats, cartStats, orderStats, walletStats, appEventStats, linkedElectricianCount, topScans, topViewedProducts, cartItems, orders, wallets, recentScans, appEvents] = await Promise.all([
      this.scanRepository.count({ where: { userId: id, role } }),
      hasCartTable ? this.cartRepository.count({ where: { userId: id, userRole: role } }) : Promise.resolve(0),
      hasOrderTable ? this.orderRepository.count({ where: { userId: id, userRole: role } }) : Promise.resolve(0),
      this.walletRepository.count({ where: { userId: id, userRole: role } }),
      this.appActivityRepository.count({ where: { userId: id, userRole: role } }),
      this.electricianRepository.count({ where: { dealerId: id } }),
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
      user: dealer,
      summary: {
        scans: scanStats,
        cartItems: cartStats,
        productOrders: orderStats,
        walletTransactions: walletStats,
        appEvents: appEventStats,
        linkedElectricians: linkedElectricianCount,
        favoriteProduct: products[0]?.productName ?? 'No product signal yet',
        lastActivityAt: timeline[0]?.occurredAt ?? null,
      },
      productInterests: products.slice(0, 10),
      recentTimeline: timeline,
      note: 'Product interest is calculated from scans, cart items, orders, wallet activity, catalog downloads, app touch activity, and linked electrician count already stored in the database.',
    };
  }

  private mapImportColumns(record: any) {
    const map: Record<string, string> = {
      'STATE': 'state',
      'DISTRICT': 'district',
      'DEALER NAME': 'contactPerson',
      'SHOP/BUSINESS NAME': 'name',
      'SHOP BUSINESS NAME': 'name',
      'DEALER ADDRESS': 'address',
      'GST/PAN NUMBER': 'gstNumber',
      'GST PAN NUMBER': 'gstNumber',
      'PHONE NO.': 'phone',
      'PHONE NO': 'phone',
      'SALES MAN NAME': 'salesManName',
      'TOWN': 'town',
      'TOWN CODE': 'townCode',
      'ELECTRICIAN LIST': 'electricianList',
      'LIST CODE': 'listCode',
      'RTO CODE': 'rtoCode',
      'DEALER CODE': 'dealerCode',
    };

    const normalize = (k: string) =>
      k.toUpperCase().trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');

    const mapped: any = {};

    for (const [key, value] of Object.entries(record)) {
      const normalized = normalize(key);
      const dbField = map[normalized] || null;

      if (dbField) {
        mapped[dbField] = value;
      }
    }

    // Fallback: use DEALER NAME as name if SHOP/BUSINESS NAME is empty
    if (!String(mapped.name ?? '').trim() && String(mapped.contactPerson ?? '').trim()) {
      mapped.name = mapped.contactPerson;
    }

    return mapped;
  }

  async importMany(records: any[]) {
    let created = 0, updated = 0, failed = 0, errors: string[] = [];

    for (const record of records) {
      let mapped: any;
      try {
        mapped = this.mapImportColumns(record);

        if (!String(mapped.name ?? '').trim() || !String(mapped.phone ?? '').trim()) {
          failed++;
          errors.push(`Row missing SHOP/BUSINESS NAME or PHONE NO.: ${JSON.stringify(record)}`);
          continue;
        }

        const rawPhone = String(mapped.phone).trim();
        const phone = rawPhone.replace(/\D/g, '').slice(0, 10);

        if (!phone || phone.length < 10) {
          failed++;
          errors.push(`Invalid phone number: ${rawPhone}`);
          continue;
        }

        mapped.phone = phone;

        let existing = await this.dealerRepository.findOne({ where: { phone } });

        const saveOrRetry = async (data: any, retries = 0): Promise<void> => {
          try {
            const entity = this.dealerRepository.create(data);
            await this.dealerRepository.save(entity);
          } catch (saveErr: any) {
            if (saveErr.code === '23505' && saveErr.constraint?.includes('dealerCode') && retries < 3) {
              data.dealerCode = `DLR${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
              return saveOrRetry(data, retries + 1);
            }
            throw saveErr;
          }
        };

        if (existing) {
          const { id, joinedDate, tier, electricianCount, ...updateData } = mapped;
          await this.dealerRepository.update(existing.id, updateData);
          await this.tierService.syncDealerTier(existing.id);
          updated++;
        } else {
          await this.crossRolePhoneService.assertPhoneAvailableForRole(phone, 'dealer');
          const data: any = { ...mapped };
          if (!data.dealerCode) {
            data.dealerCode = `DLR${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
          }
          data.electricianCount = 0;
          data.tier = MemberTier.SILVER;
          await saveOrRetry(data);
          created++;
        }
      } catch (err: any) {
        const ref = String(mapped?.name ?? record.name ?? mapped?.phone ?? record.phone ?? 'unknown');
        failed++;
        errors.push(`Row ${ref}: ${err.message}`);
      }
    }

    return { created, updated, failed, errors: errors.slice(0, 20), total: records.length };
  }

  async getDistinctStates(): Promise<{ states: string[] }> {
    const rows = await this.dealerRepository
      .createQueryBuilder('dealer')
      .select('DISTINCT dealer.state', 'state')
      .where('dealer.state IS NOT NULL')
      .andWhere(`TRIM(dealer.state) <> ''`)
      .orderBy('dealer.state', 'ASC')
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
    const query = this.dealerRepository
      .createQueryBuilder('dealer')
      .select('DISTINCT dealer.town', 'city')
      .where('dealer.town IS NOT NULL')
      .andWhere(`TRIM(dealer.town) <> ''`);
    if (state) {
      query.andWhere('dealer.state = :state', { state });
    }
    const rows = await query.orderBy('dealer.town', 'ASC').getRawMany();
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

  async getTop(from: string, to: string, limit: number = 10) {
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

    const results = await this.electricianRepository
      .createQueryBuilder('e')
      .select('e.dealerId', 'dealerId')
      .addSelect('COUNT(*)', 'periodElectricians')
      .where('e.joinedDate >= :from', { from: fromDate })
      .andWhere('e.joinedDate <= :to', { to: toDate })
      .andWhere('e.dealerId IS NOT NULL')
      .groupBy('e.dealerId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany();

    if (results.length === 0) return [];

    const dealerIds = results.map(r => r.dealerId);
    const dealers = await this.dealerRepository
      .createQueryBuilder('d')
      .where('d.id IN (:...ids)', { ids: dealerIds })
      .getMany();

    const dealerMap = new Map(dealers.map(d => [d.id, d]));

    return results.map(r => {
      const d = dealerMap.get(r.dealerId);
      return {
        id: r.dealerId,
        name: d?.name ?? 'Unknown',
        phone: d?.phone ?? '',
        dealerCode: d?.dealerCode ?? '',
        town: d?.town ?? '',
        state: d?.state ?? '',
        tier: d?.tier ?? 'Silver',
        electricianCount: d?.electricianCount ?? 0,
        monthlyTarget: d?.monthlyTarget ?? 0,
        achievedTarget: d?.achievedTarget ?? 0,
        periodElectricians: Number(r.periodElectricians),
      };
    });
  }

  async getStats() {
    const row = await this.dealerRepository
      .createQueryBuilder('d')
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE d.status = :active)::int', 'active')
      .addSelect('COUNT(*) FILTER (WHERE d.status = :pending)::int', 'pending')
      .addSelect('COUNT(*) FILTER (WHERE d.status = :inactive)::int', 'inactive')
      .setParameters({
        active: UserStatus.ACTIVE,
        pending: UserStatus.PENDING,
        inactive: UserStatus.INACTIVE,
      })
      .getRawOne();

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      pending: Number(row?.pending ?? 0),
      inactive: Number(row?.inactive ?? 0),
    };
  }
}
