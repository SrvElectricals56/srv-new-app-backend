import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { GenerateQrCodeDto } from './dto/generate-qr-code.dto';
import { QrCode } from '../../database/entities/qr-code.entity';
import { Product } from '../../database/entities/product.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { Admin } from '../../database/entities/admin.entity';

@Injectable()
export class QrCodeService {
  constructor(
    @InjectRepository(QrCode)
    private qrCodeRepository: Repository<QrCode>,
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

  async generate(generateQrCodeDto: GenerateQrCodeDto, adminId?: string) {
    const { productId, quantity, rewardPoints } = generateQrCodeDto;

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
    const row = await this.qrCodeRepository
      .createQueryBuilder('qr')
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE qr."isScanned" = false AND qr."isActive" = true)::int', 'active')
      .addSelect('COUNT(*) FILTER (WHERE qr."isScanned" = true)::int', 'used')
      .getRawOne();

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
    const whereSql = search
      ? `WHERE (
          q."productName" ILIKE $1
          OR q."batchId" ILIKE $1
          OR CAST(q."batchNo" AS text) ILIKE $1
        )`
      : '';
    const params = search ? [`%${search}%`] : [];
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const data = await this.qrCodeRepository.query(
      `
        SELECT
          COALESCE(q."batchId", CAST(q."batchNo" AS text), q."id"::text) AS "id",
          COALESCE(q."batchId", CAST(q."batchNo" AS text), q."id"::text) AS "batchId",
          MAX(q."batchNo") AS "batchNo",
          MAX(q."productId"::text) AS "productId",
          MAX(q."productName") AS "productName",
          MIN(q."createdAt") AS "generatedDate",
          COALESCE(MAX(q."rewardPoints"), 0) AS "points",
          COUNT(*)::int AS "qty",
          SUM(CASE WHEN q."isScanned" = true THEN 1 ELSE 0 END)::int AS "usedQty",
          SUM(CASE WHEN q."isScanned" = false THEN 1 ELSE 0 END)::int AS "activeQty"
        FROM "qr_codes" q
        ${whereSql}
        GROUP BY COALESCE(q."batchId", CAST(q."batchNo" AS text), q."id"::text)
        ORDER BY MAX(q."batchNo") DESC NULLS LAST, MIN(q."createdAt") DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      [...params, safeLimit, offset],
    );

    const countRows = await this.qrCodeRepository.query(
      `
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT COALESCE(q."batchId", CAST(q."batchNo" AS text), q."id"::text) AS "batchKey"
          FROM "qr_codes" q
          ${whereSql}
          GROUP BY COALESCE(q."batchId", CAST(q."batchNo" AS text), q."id"::text)
        ) batches
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
    const skip = (page - 1) * limit;
    const queryBuilder = this.qrCodeRepository
      .createQueryBuilder('qrCode')
      .leftJoinAndSelect('qrCode.product', 'product');

    if (productId) {
      queryBuilder.andWhere('qrCode.productId = :productId', { productId });
    }

    if (isScanned !== undefined) {
      queryBuilder.andWhere('qrCode.isScanned = :isScanned', { isScanned });
    }

    if (search) {
      queryBuilder.andWhere(
        `(
          qrCode.code ILIKE :search
          OR qrCode.productName ILIKE :search
          OR qrCode.batchId ILIKE :search
          OR CAST(qrCode.batchNo AS text) ILIKE :search
        )`,
        { search: `%${search}%` },
      );
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
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
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
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
    }

    if (body.rewardPoints !== undefined) {
      const points = Number(body.rewardPoints);
      if (!Number.isFinite(points) || points < 0) {
        throw new BadRequestException(
          'rewardPoints must be a valid non-negative number',
        );
      }
      updates.rewardPoints = points;
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
         AND wt."referenceId" = s."id"
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
