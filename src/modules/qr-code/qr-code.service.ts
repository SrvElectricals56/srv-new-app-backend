import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
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
export class QrCodeService implements OnModuleInit {
  private readonly logger = new Logger(QrCodeService.name);
  private schemaEnsured = false;

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

  async onModuleInit() {
    await this.ensureLegacyColumns();
  }

  async generate(generateQrCodeDto: GenerateQrCodeDto, adminId?: string) {
    await this.ensureLegacyColumns();

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
    await this.ensureLegacyColumns();

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
    await this.ensureLegacyColumns();

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
          MAX(q."productId") AS "productId",
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
    await this.ensureLegacyColumns();

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

    const scannedUserIds = data
      .filter((qr) => qr.lastScannedBy)
      .map((qr) => qr.lastScannedBy);
    const uniqueIds = [...new Set(scannedUserIds)];

    const [electricians, dealers, appUsers, counterBoys] = await Promise.all([
      uniqueIds.length
        ? this.electricianRepository.find({ where: uniqueIds.map((id) => ({ id })) })
        : Promise.resolve([]),
      uniqueIds.length
        ? this.dealerRepository.find({ where: uniqueIds.map((id) => ({ id })) })
        : Promise.resolve([]),
      uniqueIds.length
        ? this.appUserRepository.find({ where: uniqueIds.map((id) => ({ id })) })
        : Promise.resolve([]),
      uniqueIds.length
        ? this.counterBoyRepository.find({ where: uniqueIds.map((id) => ({ id })) })
        : Promise.resolve([]),
    ]);

    const userMap = new Map<string, { phone: string; code: string }>();
    for (const u of electricians) userMap.set(u.id, { phone: u.phone, code: u.electricianCode });
    for (const u of dealers) userMap.set(u.id, { phone: u.phone, code: u.dealerCode });
    for (const u of appUsers) userMap.set(u.id, { phone: u.phone, code: u.userCode });
    for (const u of counterBoys) userMap.set(u.id, { phone: u.phone, code: u.counterboyCode });

    const adminIds = data
      .filter((qr) => qr.createdBy)
      .map((qr) => qr.createdBy);
    const uniqueAdminIds = [...new Set(adminIds)];
    const admins = uniqueAdminIds.length
      ? await this.adminRepository.find({ where: uniqueAdminIds.map((id) => ({ id })) })
      : [];
    const adminNameMap = new Map<string, string>();
    for (const a of admins) adminNameMap.set(a.id, a.name);

    const enriched = data.map((qr) => {
      const productPoints = qr.product?.points ?? 0;
      const effectivePoints = qr.rewardPoints ?? productPoints;
      const user = qr.lastScannedBy ? userMap.get(qr.lastScannedBy) : undefined;

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

  async findOne(id: string) {
    await this.ensureLegacyColumns();

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
    await this.ensureLegacyColumns();

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
    await this.ensureLegacyColumns();

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
    await this.ensureLegacyColumns();

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
    await this.ensureLegacyColumns();

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

  private async ensureLegacyColumns() {
    if (this.schemaEnsured) {
      return;
    }

    try {
      await this.qrCodeRepository.query(`
        ALTER TABLE "qr_codes"
        ADD COLUMN IF NOT EXISTS "batchNo" integer
      `);

      await this.qrCodeRepository.query(`
        ALTER TABLE "qr_codes"
        ADD COLUMN IF NOT EXISTS "sequenceNo" integer
      `);

      await this.qrCodeRepository.query(`
        ALTER TABLE "qr_codes"
        ADD COLUMN IF NOT EXISTS "rewardPoints" integer NOT NULL DEFAULT 0
      `);

      await this.qrCodeRepository.query(`
        UPDATE "qr_codes"
        SET "rewardPoints" = COALESCE("rewardPoints", 0)
      `);

      await this.qrCodeRepository.query(`
        ALTER TABLE "qr_codes"
        ADD COLUMN IF NOT EXISTS "createdBy" character varying
      `);

      await this.qrCodeRepository.query(`
        ALTER TABLE "qr_codes"
        ADD COLUMN IF NOT EXISTS "legacyRedeemerId" integer,
        ADD COLUMN IF NOT EXISTS "redeemerName" character varying,
        ADD COLUMN IF NOT EXISTS "redeemerPhone" character varying,
        ADD COLUMN IF NOT EXISTS "redeemerCode" character varying
      `);

      await this.qrCodeRepository.query(`
        CREATE INDEX IF NOT EXISTS "IDX_qr_codes_batchId" ON "qr_codes" ("batchId");
        CREATE INDEX IF NOT EXISTS "IDX_qr_codes_batchNo" ON "qr_codes" ("batchNo");
        CREATE INDEX IF NOT EXISTS "IDX_qr_codes_productId" ON "qr_codes" ("productId");
        CREATE INDEX IF NOT EXISTS "IDX_qr_codes_isScanned_isActive" ON "qr_codes" ("isScanned", "isActive");
        CREATE INDEX IF NOT EXISTS "IDX_qr_codes_createdAt" ON "qr_codes" ("createdAt" DESC);
        CREATE INDEX IF NOT EXISTS "IDX_qr_codes_legacyRedeemerId" ON "qr_codes" ("legacyRedeemerId");
      `);

      this.schemaEnsured = true;
    } catch (error) {
      this.logger.error(
        'Unable to ensure qr_codes legacy columns exist',
        error as Error,
      );
      throw error;
    }
  }

  private async getNextBatchNo() {
    const rows = await this.qrCodeRepository.query(
      `SELECT COALESCE(MAX("batchNo"), 0) AS "maxBatchNo" FROM "qr_codes"`,
    );
    const current = Number(rows?.[0]?.maxBatchNo ?? 0);
    return current + 1;
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
