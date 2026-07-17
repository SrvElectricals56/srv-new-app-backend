import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { GenerateQrCodeDto } from './dto/generate-qr-code.dto';
import { QrCode } from '../../database/entities/qr-code.entity';
import { QrDownloadHistory } from '../../database/entities/qr-download-history.entity';
import { Product } from '../../database/entities/product.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Admin } from '../../database/entities/admin.entity';
import { extractQrCodeCandidates } from '../../common/utils/qr-code.util';

@Injectable()
export class QrCodeService {
  constructor(
    @InjectRepository(QrCode)
    private qrCodeRepository: Repository<QrCode>,
    @InjectRepository(QrDownloadHistory)
    private qrDownloadHistoryRepository: Repository<QrDownloadHistory>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Electrician)
    private electricianRepository: Repository<Electrician>,
    @InjectRepository(Dealer)
    private dealerRepository: Repository<Dealer>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
  ) {}

  async recordDownloadHistory(
    admin: { id: string; email?: string; name?: string; role?: string },
    body: {
      productId?: string;
      productName?: string;
      batchId?: string;
      batchNo?: number | string | null;
      quantity?: number;
      downloadType?: string;
    },
  ) {
    const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)));
    if (!Number.isFinite(quantity)) {
      throw new BadRequestException('quantity must be a valid number');
    }

    const productName = String(body.productName ?? '').trim();
    if (!productName) {
      throw new BadRequestException('productName is required');
    }

    const batchNo = body.batchNo === null || body.batchNo === undefined || body.batchNo === ''
      ? null
      : Number(body.batchNo);

    const rows = await this.qrDownloadHistoryRepository.query(
      `
        INSERT INTO "qr_download_history"
          ("adminId", "adminEmail", "adminName", "adminRole", "productId", "productName",
           "batchId", "batchNo", "quantity", "downloadType", "downloadedAt", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now(),now())
        RETURNING *
      `,
      [
        admin.id ?? null,
        admin.email ?? null,
        admin.name ?? null,
        admin.role ?? 'staff',
        body.productId ?? null,
        productName,
        body.batchId ?? null,
        Number.isFinite(batchNo) ? batchNo : null,
        quantity,
        String(body.downloadType ?? 'qr').trim() || 'qr',
      ],
    );

    return {
      message: 'QR download history recorded',
      data: rows?.[0] ?? null,
    };
  }

  async getDownloadHistory(
    admin: { id?: string; role?: string },
    page = 1,
    limit = 20,
    search?: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (safePage - 1) * safeLimit;
    const params: any[] = [];
    const where: string[] = [];

    if (admin.role !== 'super_admin') {
      if (!admin.id) {
        throw new ForbiddenException('Admin session is required to view QR history');
      }
      params.push(admin.id);
      where.push(`h."adminId" = $${params.length}`);
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      params.push(`%${trimmedSearch}%`);
      where.push(`(
        h."adminEmail" ILIKE $${params.length}
        OR h."adminName" ILIKE $${params.length}
        OR h."productName" ILIKE $${params.length}
        OR h."batchId" ILIKE $${params.length}
        OR CAST(h."batchNo" AS text) ILIKE $${params.length}
      )`);
    }

    if (fromDate) {
      params.push(fromDate);
      where.push(`h."downloadedAt" >= $${params.length}::date`);
    }

    if (toDate) {
      params.push(toDate);
      where.push(`h."downloadedAt" < ($${params.length}::date + interval '1 day')`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const data = await this.qrDownloadHistoryRepository.query(
      `
        SELECT
          h."id",
          h."adminId",
          h."adminEmail",
          h."adminName",
          h."adminRole",
          h."productId",
          h."productName",
          h."batchId",
          h."batchNo",
          h."quantity",
          h."downloadType",
          h."downloadedAt",
          h."createdAt",
          h."updatedAt"
        FROM "qr_download_history" h
        ${whereSql}
        ORDER BY h."downloadedAt" DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      [...params, safeLimit, offset],
    );

    const countRows = await this.qrDownloadHistoryRepository.query(
      `SELECT COUNT(*)::int AS total FROM "qr_download_history" h ${whereSql}`,
      params,
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async generate(generateQrCodeDto: GenerateQrCodeDto, admin?: { id?: string; email?: string; name?: string; role?: string }) {
    const { productId, quantity, rewardPoints } = generateQrCodeDto;
    const adminId = admin?.id;

    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (quantity <= 0 || quantity > 20000) {
      throw new BadRequestException('Quantity must be between 1 and 20000');
    }

    const frozenRewardPoints = Number(rewardPoints ?? product.points ?? 0);
    if (!Number.isFinite(frozenRewardPoints) || frozenRewardPoints < 0) {
      throw new BadRequestException('rewardPoints must be a valid non-negative number');
    }

    const batchNo = await this.getNextBatchNo();
    const batchId = String(batchNo);

    // ── Generate all codes in-memory (pure CPU, no async) ─────────────────
    const codes: string[] = [];
    const seen = new Set<string>();
    const batchNoStr = batchNo.toString(36).padStart(4, '0').toUpperCase();

    for (let i = 0; i < quantity; i++) {
      let code: string;
      let attempts = 0;
      do {
        // Fast: no crypto hash — combine batch+seq+random hex suffix
        const seq = (i + 1).toString(36).padStart(5, '0').toUpperCase();
        const rand = randomBytes(3).toString('hex').toUpperCase(); // 6 chars
        code = `${batchNoStr}${seq}${rand}`.substring(0, 20).padEnd(20, '0');
        attempts++;
      } while (seen.has(code) && attempts < 10);
      seen.add(code);
      codes.push(code);
    }

    // ── Bulk INSERT via raw SQL (10-20x faster than TypeORM save()) ────────
    const CHUNK = 2000;
    const now = new Date().toISOString();
    const savedCodes: { id: string; code: string; createdAt: string }[] = [];

    for (let i = 0; i < codes.length; i += CHUNK) {
      const slice = codes.slice(i, i + CHUNK);
      const values: string[] = [];
      const params: any[] = [];
      let p = 1;

      for (let j = 0; j < slice.length; j++) {
        const code = slice[j];
        const seqNo = i + j + 1;
        const imgUrl = this.buildQrImageUrl(code);
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(
          code,         // code
          productId,    // productId
          product.name, // productName
          imgUrl,       // qrImageUrl
          false,        // isScanned
          true,         // isActive
          batchId,      // batchId
          batchNo,      // batchNo
          seqNo,        // sequenceNo
          frozenRewardPoints, // rewardPoints
          adminId ?? null,    // createdBy
        );
      }

      const rows: { id: string; code: string }[] = await this.qrCodeRepository.query(
        `INSERT INTO "qr_codes"
           ("code","productId","productName","qrImageUrl","isScanned","isActive","batchId","batchNo","sequenceNo","rewardPoints","createdBy")
         VALUES ${values.join(',')}
         RETURNING id, code`,
        params,
      );

      for (const row of rows) {
        savedCodes.push({ id: row.id, code: row.code, createdAt: now });
      }
    }

    await this.qrCodeRepository.query(
      `
        INSERT INTO "qr_code_batches" (
          "batchId",
          "batchNo",
          "productId",
          "productName",
          "generatedDate",
          "points",
          "qty",
          "usedQty",
          "activeQty",
          "createdBy",
          "updatedAt"
        )
        VALUES ($1,$2,$3,$4,now(),$5,$6,0,$6,$7,now())
        ON CONFLICT ("batchId") DO UPDATE SET
          "batchNo" = EXCLUDED."batchNo",
          "productId" = EXCLUDED."productId",
          "productName" = EXCLUDED."productName",
          "points" = EXCLUDED."points",
          "qty" = "qr_code_batches"."qty" + EXCLUDED."qty",
          "activeQty" = "qr_code_batches"."activeQty" + EXCLUDED."activeQty",
          "createdBy" = COALESCE(EXCLUDED."createdBy", "qr_code_batches"."createdBy"),
          "updatedAt" = now()
      `,
      [batchId, batchNo, productId, product.name, frozenRewardPoints, savedCodes.length, adminId ?? null],
    );

    if (admin?.id) {
      await this.recordDownloadHistory(
        admin as { id: string; email?: string; name?: string; role?: string },
        {
        productId,
        productName: product.name,
        batchId,
        batchNo,
        quantity: savedCodes.length,
        downloadType: 'generated',
        },
      );
    }

    return {
      message: `${quantity} QR codes generated successfully`,
      batchId,
      batchNo,
      productName: product.name,
      sku: product.sku,
      points: frozenRewardPoints,
      // Return only lightweight code list — frontend doesn't need full entity
      codes: savedCodes,
      total: savedCodes.length,
    };
  }

  async getStats() {
    const rows = await this.qrCodeRepository.query(`
      SELECT
        COALESCE(SUM("qty"), 0)::int AS "total",
        COALESCE(SUM("activeQty"), 0)::int AS "active",
        COALESCE(SUM("usedQty"), 0)::int AS "used"
      FROM "qr_code_batches"
    `);
    const row = rows?.[0] ?? {};

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      used: Number(row?.used ?? 0),
      scanned: Number(row?.used ?? 0),
    };
  }

  async findBatches(page: number = 1, limit: number = 20, search?: string) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (safePage - 1) * safeLimit;
    const trimmedSearch = search?.trim();
    const whereSql = trimmedSearch
      ? `WHERE (
          b."productName" ILIKE $1
          OR b."batchId" ILIKE $1
          OR CAST(b."batchNo" AS text) ILIKE $1
        )`
      : '';
    const params = trimmedSearch ? [`%${trimmedSearch}%`] : [];
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const data = await this.qrCodeRepository.query(
      `
        SELECT
          b."batchId" AS "id",
          b."batchId",
          b."batchNo",
          b."productId",
          b."productName",
          b."generatedDate",
          b."points",
          b."qty",
          b."usedQty",
          b."activeQty"
        FROM "qr_code_batches" b
        ${whereSql}
        ORDER BY b."batchNo" DESC NULLS LAST, b."generatedDate" DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      [...params, safeLimit, offset],
    );

    const countRows = await this.qrCodeRepository.query(
      `
        SELECT COUNT(*)::int AS total
        FROM "qr_code_batches" b
        ${whereSql}
      `,
      params,
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    productId?: string,
    isScanned?: boolean,
    search?: string,
    batchId?: string,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;
    const trimmedSearch = search?.trim();
    const queryBuilder = this.qrCodeRepository
      .createQueryBuilder('qrCode')
      .leftJoinAndSelect('qrCode.product', 'product');

    if (productId) {
      queryBuilder.andWhere('qrCode.productId = :productId', { productId });
    }

    if (isScanned !== undefined) {
      queryBuilder.andWhere('qrCode.isScanned = :isScanned', { isScanned });
    }

    if (trimmedSearch) {
      const normalizedCode = trimmedSearch.replace(/\.png$/i, '');
      const numericSearch = /^\d+$/.test(trimmedSearch);
      if (numericSearch) {
        queryBuilder.andWhere(
          `(
            LOWER(qrCode.code) = LOWER(:exactCode)
            OR qrCode.batchId = :exactCode
            OR qrCode.batchNo = CAST(:numericExact AS integer)
            OR "qrCode"."legacyId" = CAST(:numericExact AS bigint)
          )`,
          { exactCode: normalizedCode, numericExact: normalizedCode },
        );
      } else {
        queryBuilder.andWhere(
          `(
            LOWER(qrCode.code) = LOWER(:exactCode)
            OR qrCode.productName ILIKE :search
            OR qrCode.batchId = :exactCode
          )`,
          { exactCode: normalizedCode, search: `%${trimmedSearch}%` },
        );
      }
    }

    if (batchId) {
      queryBuilder.andWhere(
        '(qrCode.batchId = :batchId OR CAST(qrCode.batchNo AS text) = :batchId)',
        { batchId },
      );
    }

    queryBuilder
      .orderBy('qrCode.batchNo', 'DESC', 'NULLS LAST')
      .addOrderBy('qrCode.sequenceNo', 'ASC', 'NULLS LAST')
      .addOrderBy('qrCode.createdAt', 'DESC')
      .skip(skip)
      .take(safeLimit);

    const hasFilters = Boolean(productId || isScanned !== undefined || trimmedSearch || batchId);
    let data: QrCode[];
    let total: number;
    if (hasFilters) {
      [data, total] = await queryBuilder.getManyAndCount();
    } else {
      data = await queryBuilder.getMany();
      const rows = await this.qrCodeRepository.query(`
        SELECT COALESCE(SUM("qty"), 0)::bigint AS total FROM "qr_code_batches"
      `);
      total = Number(rows?.[0]?.total ?? 0);
    }
    const firstScanMap = await this.getFirstScanMap(data.map((qr) => qr.id));

    const scannedUserIds = data
      .filter((qr) => qr.lastScannedBy)
      .map((qr) => qr.lastScannedBy);
    const uniqueIds = [...new Set(scannedUserIds)];

    const userMap = new Map<string, { phone: string; code: string }>();
    if (uniqueIds.length) {
      const users = await this.lookupScannerSummaries(uniqueIds);
      for (const u of users) {
        userMap.set(u.id, { phone: u.phone, code: u.code });
      }
    }

    const adminIds = data
      .filter((qr) => qr.createdBy)
      .map((qr) => qr.createdBy);
    const uniqueAdminIds = [...new Set(adminIds)];
    const adminNameMap = new Map<string, string>();
    if (uniqueAdminIds.length) {
      const admins = await this.lookupAdminNames(uniqueAdminIds);
      for (const a of admins) adminNameMap.set(a.id, a.name);
    }

    const enriched = data.map((qr) => {
      const productPoints = qr.product?.points ?? 0;
      const effectivePoints = qr.rewardPoints ?? productPoints;
      const user = qr.lastScannedBy ? userMap.get(qr.lastScannedBy) : undefined;
      const firstScan = firstScanMap.get(qr.id) ?? null;

      const adminName = qr.createdBy ? adminNameMap.get(qr.createdBy) : undefined;

      return {
        id: qr.id,
        code: qr.code,
        productId: qr.productId,
        productName: qr.productName,
        qrImageUrl: qr.qrImageUrl,
        isScanned: qr.isScanned,
        scanCount: qr.scanCount,
        lastScannedBy: qr.lastScannedBy,
        lastScannedAt: qr.lastScannedAt,
        lastScannedPhone: user?.phone ?? qr.redeemerPhone ?? null,
        lastScannedCode: user?.code ?? qr.redeemerCode ?? null,
        lastScannedName: qr.redeemerName ?? null,
        firstScan: firstScan
          ? {
              ...firstScan,
              phone: firstScan.phone ?? qr.redeemerPhone ?? null,
              code: firstScan.code ?? qr.redeemerCode ?? null,
              userName: firstScan.userName ?? qr.redeemerName ?? null,
            }
          : null,
        generatedBy: adminName ?? 'Admin',
        batchId: qr.batchId ?? (qr.batchNo ? String(qr.batchNo) : null),
        batchNo: qr.batchNo ?? null,
        sequenceNo: qr.sequenceNo ?? null,
        rewardPoints: effectivePoints,
        isActive: qr.isActive,
        createdAt: qr.createdAt,
        updatedAt: qr.updatedAt,
        points: effectivePoints,
        product: qr.product
          ? {
              id: qr.product.id,
              name: qr.product.name,
              points: qr.product.points,
              sku: qr.product.sku,
              isActive: qr.product.isActive,
            }
          : null,
      };
    });

    return {
      data: enriched,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findFirstScan(id: string) {
    let qrCode = await this.qrCodeRepository.findOne({ where: { id } });
    if (!qrCode) {
      qrCode = await this.qrCodeRepository.findOne({ where: { code: id } });
    }
    if (!qrCode) {
      throw new NotFoundException(`QR code "${id}" not found`);
    }

    const firstScan = (await this.getFirstScanMap([qrCode.id])).get(qrCode.id);

    return {
      qrCodeId: qrCode.id,
      code: qrCode.code,
      firstScan: firstScan
        ? {
            ...firstScan,
            phone: firstScan.phone ?? qrCode.redeemerPhone ?? null,
            code: firstScan.code ?? qrCode.redeemerCode ?? null,
            userName: firstScan.userName ?? qrCode.redeemerName ?? null,
          }
        : null,
    };
  }

  async scanLookup(rawQrCode: string) {
    const candidates = extractQrCodeCandidates(rawQrCode);
    if (!candidates.length) {
      throw new BadRequestException('Please provide a valid QR code value');
    }

    let lastError: unknown = null;
    for (const candidate of candidates) {
      try {
        return await this.findFirstScan(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof NotFoundException) {
      throw new NotFoundException('QR code not found in SRV records');
    }
    throw lastError ?? new NotFoundException('QR code not found in SRV records');
  }

  async findOne(id: string) {
    const qrCode = await this.qrCodeRepository.findOne({
      where: { id },
      relations: ['product'],
    });

    if (!qrCode) {
      throw new NotFoundException(`QR code with id "${id}" not found`);
    }

    return qrCode;
  }

  async updateBatch(
    batchId: string,
    body: { productId?: string; rewardPoints?: number },
  ) {
    const updates: Partial<QrCode> = {};

    if (body.productId) {
      const product = await this.productRepository.findOne({
        where: { id: body.productId },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      updates.productId = product.id;
      updates.productName = product.name;

      await this.qrCodeRepository.query(
        `
          UPDATE "qr_code_batches"
          SET "productId" = $2,
              "productName" = $3,
              "updatedAt" = now()
          WHERE "batchId" = $1 OR "batchNo"::text = $1
        `,
        [batchId, product.id, product.name],
      );
    }

    if (body.rewardPoints !== undefined) {
      const points = Number(body.rewardPoints);
      if (!Number.isFinite(points) || points < 0) {
        throw new BadRequestException(
          'rewardPoints must be a valid non-negative number',
        );
      }
      updates.rewardPoints = points;

      await this.qrCodeRepository.query(
        `
          UPDATE "qr_code_batches"
          SET "points" = $2,
              "updatedAt" = now()
          WHERE "batchId" = $1 OR "batchNo"::text = $1
        `,
        [batchId, points],
      );
    }

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No batch fields provided to update');
    }

    const result = await this.qrCodeRepository
      .createQueryBuilder()
      .update(QrCode)
      .set(updates)
      .where('"batchId" = :batchId OR CAST("batchNo" AS text) = :batchId', {
        batchId,
      })
      .execute();

    if (!result.affected) {
      throw new NotFoundException(`QR batch "${batchId}" not found`);
    }

    return {
      message: 'QR batch updated successfully',
      updated: result.affected,
    };
  }

  async remove(id: string) {
    let qrCode = await this.qrCodeRepository.findOne({ where: { id } });
    if (!qrCode) {
      qrCode = await this.qrCodeRepository.findOne({ where: { code: id } });
    }
    if (!qrCode) {
      throw new NotFoundException(`QR code "${id}" not found`);
    }
    await this.qrCodeRepository.remove(qrCode);
    await this.qrCodeRepository.query(
      `
        UPDATE "qr_code_batches"
        SET "qty" = GREATEST("qty" - 1, 0),
            "usedQty" = GREATEST("usedQty" - CASE WHEN $2::boolean THEN 1 ELSE 0 END, 0),
            "activeQty" = GREATEST("activeQty" - CASE WHEN $3::boolean THEN 1 ELSE 0 END, 0),
            "updatedAt" = now()
        WHERE "batchId" = $1
      `,
      [
        qrCode.batchId ?? (qrCode.batchNo ? String(qrCode.batchNo) : qrCode.id),
        Boolean(qrCode.isScanned),
        !qrCode.isScanned && qrCode.isActive,
      ],
    );
    return { message: 'QR code deleted successfully' };
  }

  async removeBatch(batchId: string) {
    const result = await this.qrCodeRepository
      .createQueryBuilder()
      .delete()
      .from(QrCode)
      .where('"batchId" = :batchId OR CAST("batchNo" AS text) = :batchId', {
        batchId,
      })
      .execute();

    if (!result.affected) {
      throw new NotFoundException(`QR batch "${batchId}" not found`);
    }

    await this.qrCodeRepository.query(
      'DELETE FROM "qr_code_batches" WHERE "batchId" = $1 OR "batchNo"::text = $1',
      [batchId],
    );

    return {
      message: 'QR batch deleted successfully',
      deleted: result.affected,
    };
  }

  async removeAll(productId?: string) {
    if (productId) {
      const result = await this.qrCodeRepository.delete({ productId });
      return {
        message: `Deleted all QR codes for product ${productId}`,
        deleted: result.affected ?? 0,
      };
    }

    const count = await this.qrCodeRepository.count();
    await this.qrCodeRepository.clear();
    return { message: 'All QR codes deleted', deleted: count };
  }

  private async getNextBatchNo() {
    const rows = await this.qrCodeRepository.query(
      `SELECT COALESCE(MAX("batchNo"), 0) AS "maxBatchNo" FROM "qr_codes"`,
    );
    const current = Number(rows?.[0]?.maxBatchNo ?? 0);
    return current + 1;
  }

  private async getFirstScanMap(qrCodeIds: string[]) {
    const ids = [...new Set(qrCodeIds.filter(Boolean))];
    const map = new Map<string, any>();
    if (!ids.length) {
      return map;
    }

    const rows = await this.qrCodeRepository.query(
      `
        SELECT DISTINCT ON (s."qrCodeId")
          s."qrCodeId",
          s."id",
          s."userId",
          s."userName",
          s."role"::text AS "role",
          COALESCE(e."phone", d."phone", u."phone", cb."phone") AS "phone",
          COALESCE(e."electricianCode", d."dealerCode", u."userCode", cb."counterboyCode") AS "code",
          s."productId",
          s."productName",
          s."points",
          COALESCE(wt."amount", s."points") AS "pointsRedeemed",
          wt."balanceAfter" AS "walletBalanceAfter",
          COALESCE(d."id"::text, linked_dealer."id"::text, e."dealerId"::text, cb."dealerId"::text) AS "dealerId",
          COALESCE(d."name", linked_dealer."name", e."fallbackDealerName") AS "dealerName",
          COALESCE(d."phone", linked_dealer."phone", e."fallbackDealerPhone") AS "dealerPhone",
          COALESCE(d."dealerCode", linked_dealer."dealerCode") AS "dealerCode",
          s."mode"::text AS "mode",
          s."location",
          s."latitude",
          s."longitude",
          s."scannedAt"
        FROM "scans" s
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
        LEFT JOIN "wallet_transactions" wt
          ON wt."referenceType" = 'scan'
         AND wt."referenceId" = s."id"::text
         AND wt."source"::text = 'scan'
        WHERE s."qrCodeId" = ANY($1::text[])
        ORDER BY s."qrCodeId", s."scannedAt" ASC
      `,
      [ids],
    );

    for (const row of rows) {
      map.set(row.qrCodeId, {
        id: row.id,
        userId: row.userId,
        userName: row.userName,
        role: row.role,
        phone: row.phone,
        code: row.code,
        productId: row.productId,
        productName: row.productName,
        points: Number(row.points ?? 0),
        pointsRedeemed: Number(row.pointsRedeemed ?? row.points ?? 0),
        pointsEarned: Number(row.pointsRedeemed ?? row.points ?? 0),
        walletBalanceAfter:
          row.walletBalanceAfter === null || row.walletBalanceAfter === undefined
            ? null
            : Number(row.walletBalanceAfter),
        dealerId: row.dealerId,
        dealerName: row.dealerName,
        dealerPhone: row.dealerPhone,
        dealerCode: row.dealerCode,
        mode: row.mode,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
        scannedAt: row.scannedAt,
      });
    }

    return map;
  }

  private async lookupScannerSummaries(userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) {
      return [];
    }

    return this.qrCodeRepository.query(
      `
        SELECT e."id"::text AS "id", e."phone", e."electricianCode" AS "code"
        FROM "electricians" e
        WHERE e."id"::text = ANY($1::text[])
        UNION ALL
        SELECT d."id"::text AS "id", d."phone", d."dealerCode" AS "code"
        FROM "dealers" d
        WHERE d."id"::text = ANY($1::text[])
        UNION ALL
        SELECT u."id"::text AS "id", u."phone", u."userCode" AS "code"
        FROM "app_users" u
        WHERE u."id"::text = ANY($1::text[])
        UNION ALL
        SELECT cb."id"::text AS "id", cb."phone", cb."counterboyCode" AS "code"
        FROM "counterboys" cb
        WHERE cb."id"::text = ANY($1::text[])
      `,
      [ids],
    );
  }

  private async lookupAdminNames(adminIds: string[]) {
    const ids = [...new Set(adminIds.filter(Boolean))];
    if (!ids.length) {
      return [];
    }

    return this.qrCodeRepository.query(
      `
        SELECT a."id"::text AS "id", a."name"
        FROM "admins" a
        WHERE a."id"::text = ANY($1::text[])
      `,
      [ids],
    );
  }

  private generateFixedLengthQrCode(batchNo: number, sequenceNo: number) {
    const seed = [
      batchNo,
      sequenceNo,
      Date.now(),
      randomBytes(8).toString('hex'),
    ].join('|');

    return createHash('sha256')
      .update(seed)
      .digest('hex')
      .substring(0, 20)
      .toUpperCase();
  }

  private buildQrImageUrl(code: string) {
    return `https://quickchart.io/qr?text=${encodeURIComponent(code)}&size=220`;
  }
}
