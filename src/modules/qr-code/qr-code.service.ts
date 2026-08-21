import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
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
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';

@Injectable()
export class QrCodeService {
  private readonly excelQueryChunkSize = 10_000;
  private readonly excelMaxDataRowsPerSheet = 1_048_575;

  private getQrExcelColumnCount(product: {
    productName?: string;
    category?: string;
    subCategory?: string;
  }): 2 | 4 {
    const productName = String(product.productName ?? '');
    const productClassification = [product.category, product.subCategory]
      .filter(Boolean)
      .join(' ');
    const isModularBox = /\bmodul(?:e|ar)\s*box\b/i.test(productClassification);
    const isThreeByThreeOrFourByThree = /(?:^|\D)(?:3\s*[x×]\s*3|4\s*[x×]\s*3)(?:\D|$)/i.test(productName);
    return isModularBox && isThreeByThreeOrFourByThree ? 4 : 2;
  }

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

  private parseQrSearchDate(value: string): { start: Date; end: Date } | null {
    const monthNames = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    ];
    let year: number;
    let month: number;
    let day: number;
    let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        day = Number(match[1]);
        month = Number(match[2]);
        year = Number(match[3]);
      } else {
        match = value.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/);
        if (!match) return null;
        day = Number(match[1]);
        month = monthNames.indexOf(match[2].toLowerCase()) + 1;
        year = Number(match[3]);
      }
    }

    const validationDate = new Date(Date.UTC(year, month - 1, day));
    if (
      month < 1 ||
      validationDate.getUTCFullYear() !== year ||
      validationDate.getUTCMonth() !== month - 1 ||
      validationDate.getUTCDate() !== day
    ) {
      return null;
    }

    // India has a fixed UTC+05:30 offset, so IST midnight is 18:30 UTC.
    const start = new Date(Date.UTC(year, month - 1, day) - 330 * 60 * 1000);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

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

  async downloadBatchExcel(
    batchId: string,
    admin: { id: string; email?: string; name?: string; role?: string },
    response: Response,
  ): Promise<void> {
    const normalizedBatchId = String(batchId ?? '').trim();
    if (!normalizedBatchId) {
      throw new BadRequestException('batchId is required');
    }

    const batchRows = await this.qrCodeRepository.query(
      `
        SELECT
          b."batchId",
          b."batchNo",
          b."productId",
          b."productName",
          b."points",
          b."qty",
          p."category",
          p."subCategory"
        FROM "qr_code_batches" b
        LEFT JOIN "products" p ON p."id"::text = b."productId"::text
        WHERE b."batchId" = $1
        LIMIT 1
      `,
      [normalizedBatchId],
    );
    const batch = batchRows?.[0];
    if (!batch) {
      throw new NotFoundException(`QR batch ${normalizedBatchId} not found`);
    }

    const safeProductName = String(batch.productName ?? 'QR-Codes')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'QR-Codes';
    const batchLabel = batch.batchNo ?? normalizedBatchId;
    const qrColumnCount = this.getQrExcelColumnCount(batch);
    const filename = `${safeProductName} - ${batchLabel} - ${Number(batch.qty ?? 0)}.xlsx`;

    response.status(200);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: response,
      useStyles: true,
      useSharedStrings: false,
    });

    const headers = [
      'ID',
      'Product Name',
      'Points',
      'Status',
      'Batch No.',
      ...Array.from({ length: qrColumnCount }, (_, index) => `QR Code ${index + 1}`),
    ];
    let sheetNumber = 0;
    let rowsOnSheet = 0;
    let worksheet: ExcelJS.Worksheet;

    const startWorksheet = () => {
      sheetNumber += 1;
      rowsOnSheet = 0;
      worksheet = workbook.addWorksheet(
        sheetNumber === 1 ? 'QR Codes' : `QR Codes ${sheetNumber}`,
      );
      worksheet.columns = [
        { width: 38 },
        { width: 30 },
        { width: 12 },
        { width: 12 },
        { width: 16 },
        ...Array.from({ length: qrColumnCount }, () => ({ width: 48 })),
      ];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      headerRow.commit();
    };

    startWorksheet();

    let lastSequence = -1;
    let lastId = '00000000-0000-0000-0000-000000000000';
    let pendingQrs: any[] = [];
    let exportedCount = 0;

    const appendQrRow = (qrs: any[]) => {
      if (rowsOnSheet >= this.excelMaxDataRowsPerSheet) {
        worksheet.commit();
        startWorksheet();
      }
      const first = qrs[0];
      worksheet.addRow([
        first.legacyId ?? first.id,
        first.productName ?? batch.productName,
        Number(first.rewardPoints ?? batch.points ?? 0),
        first.isScanned ? 'Used' : 'Pending',
        first.batchNo ?? batch.batchNo ?? '',
        ...Array.from({ length: qrColumnCount }, (_, index) => qrs[index]?.code ?? ''),
      ]).commit();
      rowsOnSheet += 1;
    };

    while (true) {
      const qrRows = await this.qrCodeRepository.query(
        `
          SELECT
            q."id",
            q."legacyId",
            q."code",
            q."productName",
            q."rewardPoints",
            q."isScanned",
            q."batchNo",
            COALESCE(q."sequenceNo", 2147483647) AS "sortSequence"
          FROM "qr_codes" q
          WHERE q."batchId" = $1
            AND (COALESCE(q."sequenceNo", 2147483647), q."id") > ($2, $3)
          ORDER BY COALESCE(q."sequenceNo", 2147483647), q."id"
          LIMIT $4
        `,
        [normalizedBatchId, lastSequence, lastId, this.excelQueryChunkSize],
      );

      if (!qrRows.length) break;

      for (const qr of qrRows) {
        exportedCount += 1;
        pendingQrs.push(qr);
        if (pendingQrs.length === qrColumnCount) {
          appendQrRow(pendingQrs);
          pendingQrs = [];
        }
      }

      const lastQr = qrRows[qrRows.length - 1];
      lastSequence = Number(lastQr.sortSequence);
      lastId = String(lastQr.id);
      if (qrRows.length < this.excelQueryChunkSize) break;
    }

    if (pendingQrs.length) appendQrRow(pendingQrs);
    worksheet.commit();
    await workbook.commit();

    if (exportedCount > 0) {
      await this.recordDownloadHistory(admin, {
        productId: batch.productId,
        productName: batch.productName,
        batchId: normalizedBatchId,
        batchNo: batch.batchNo,
        quantity: exportedCount,
        downloadType: `batch_excel_${qrColumnCount}_columns`,
      });
    }
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

  async regenerate(
    id: string,
    admin?: { id?: string; email?: string; name?: string; role?: string },
  ) {
    const original = await this.qrCodeRepository.findOne({ where: [{ id }, { code: id }] });
    if (!original) throw new NotFoundException('QR code not found');
    if (!original.isScanned) {
      throw new BadRequestException('Only a used QR code needs regeneration');
    }

    const generated = await this.generate({
      productId: original.productId,
      quantity: 1,
      rewardPoints: Number(original.rewardPoints ?? 0),
    }, admin);

    return {
      ...generated,
      regeneratedFrom: {
        id: original.id,
        code: original.code,
        batchId: original.batchId,
      },
      message: 'Replacement QR code generated successfully. The used QR history was preserved.',
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
          OR p."sku" ILIKE $1
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
          p."sku" AS "productSku",
          b."generatedDate",
          b."points",
          b."qty",
          b."usedQty",
          b."activeQty"
        FROM "qr_code_batches" b
        LEFT JOIN "products" p ON p."id"::text = b."productId"::text
        ${whereSql}
        ORDER BY b."batchNo" DESC NULLS LAST, b."generatedDate" DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      [...params, safeLimit, offset],
    );

    const countRows = await this.qrCodeRepository.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(b."qty"), 0)::bigint AS "totalQty",
          COALESCE(SUM(b."usedQty"), 0)::bigint AS "usedQty",
          COALESCE(SUM(b."activeQty"), 0)::bigint AS "activeQty"
        FROM "qr_code_batches" b
        LEFT JOIN "products" p ON p."id"::text = b."productId"::text
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
      summary: {
        totalQty: Number(countRows?.[0]?.totalQty ?? 0),
        usedQty: Number(countRows?.[0]?.usedQty ?? 0),
        activeQty: Number(countRows?.[0]?.activeQty ?? 0),
      },
    };
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    productId?: string,
    isScanned?: boolean,
    search?: string,
    batchId?: string,
    includeDetails: boolean = true,
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
      const dateRange = this.parseQrSearchDate(normalizedCode);

      // qr_codes contains millions of rows in production. A single OR with
      // wildcard predicates made PostgreSQL abandon the exact-code index and
      // scan the whole table. Resolve the small lookup dimensions first, then
      // constrain the main query using indexed IDs/columns.
      const exactQr = await this.qrCodeRepository
        .createQueryBuilder('exactQr')
        .select(['exactQr.id'])
        .where('LOWER(exactQr.code) = LOWER(:exactCode)', { exactCode: normalizedCode })
        .getOne();

      if (exactQr) {
        queryBuilder.andWhere('qrCode.id = :exactQrId', { exactQrId: exactQr.id });
      } else if (dateRange) {
        queryBuilder.andWhere(
          '"qrCode"."createdAt" >= :dateStart AND "qrCode"."createdAt" < :dateEnd',
          { dateStart: dateRange.start, dateEnd: dateRange.end },
        );
      } else {
        const wildcard = `%${normalizedCode}%`;
        const [matchingProducts, matchingBatches] = await Promise.all([
          this.productRepository
            .createQueryBuilder('searchProduct')
            .select(['searchProduct.id'])
            .where('searchProduct.name ILIKE :wildcard OR searchProduct.sku ILIKE :wildcard', { wildcard })
            .limit(1000)
            .getMany(),
          this.qrCodeRepository.query(
            `
              SELECT b."batchId"
              FROM "qr_code_batches" b
              LEFT JOIN "products" p ON p."id"::text = b."productId"::text
              WHERE b."productName" ILIKE $1
                 OR b."batchId" ILIKE $1
                 OR CAST(b."batchNo" AS text) ILIKE $1
                 OR p."sku" ILIKE $1
              LIMIT 2000
            `,
            [wildcard],
          ),
        ]);
        const productIds = matchingProducts.map((item) => item.id);
        const batchIds = matchingBatches
          .map((item: { batchId?: string }) => item.batchId)
          .filter((value: string | undefined): value is string => Boolean(value));
        const numericSearch = /^\d+$/.test(normalizedCode) ? normalizedCode : null;

        queryBuilder.andWhere(new Brackets((searchQuery) => {
          let hasCondition = false;
          if (productIds.length) {
            searchQuery.where('qrCode.productId IN (:...searchProductIds)', {
              searchProductIds: productIds,
            });
            hasCondition = true;
          }
          if (batchIds.length) {
            const method = hasCondition ? 'orWhere' : 'where';
            searchQuery[method]('qrCode.batchId IN (:...searchBatchIds)', {
              searchBatchIds: batchIds,
            });
            hasCondition = true;
          }
          if (numericSearch) {
            const method = hasCondition ? 'orWhere' : 'where';
            searchQuery[method](
              '(CAST("qrCode"."legacyId" AS text) = :numericSearch OR CAST(qrCode.batchNo AS text) = :numericSearch)',
              { numericSearch },
            );
            hasCondition = true;
          }
          if (!hasCondition) searchQuery.where('1 = 0');
        }));
      }
    }

    if (batchId) {
      // Resolve the legacy numeric alias against the compact batch-summary
      // table first. Casting batchNo on the 7M+ row QR table disabled both
      // batch indexes and caused the admin batch-details request to time out.
      const parsedBatchNo = /^\d+$/.test(batchId) ? Number(batchId) : NaN;
      const numericBatchNo = Number.isSafeInteger(parsedBatchNo) && parsedBatchNo <= 2_147_483_647
        ? parsedBatchNo
        : null;
      const matchingBatches: Array<{ batchId: string }> = await this.qrCodeRepository.query(
        `
          SELECT b."batchId"
          FROM "qr_code_batches" b
          WHERE b."batchId" = $1
             OR ($2::integer IS NOT NULL AND b."batchNo" = $2::integer)
          ORDER BY CASE WHEN b."batchId" = $1 THEN 0 ELSE 1 END
          LIMIT 1
        `,
        [batchId, numericBatchNo],
      );
      const resolvedBatchId = matchingBatches[0]?.batchId;
      if (resolvedBatchId) {
        queryBuilder.andWhere('qrCode.batchId = :resolvedBatchId', { resolvedBatchId });
      } else if (numericBatchNo !== null) {
        queryBuilder.andWhere('qrCode.batchNo = :numericBatchNo', { numericBatchNo });
      } else {
        queryBuilder.andWhere('qrCode.batchId = :batchId', { batchId });
      }
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
    const firstScanMap = includeDetails
      ? await this.getFirstScanMap(data.map((qr) => qr.id))
      : new Map<string, any>();

    const scannedUserIds = data
      .filter((qr) => qr.lastScannedBy)
      .map((qr) => qr.lastScannedBy);
    const uniqueIds = [...new Set(scannedUserIds)];

    const userMap = new Map<string, { phone: string; code: string }>();
    if (includeDetails && uniqueIds.length) {
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
    if (includeDetails && uniqueAdminIds.length) {
      const admins = await this.lookupAdminNames(uniqueAdminIds);
      for (const a of admins) adminNameMap.set(a.id, a.name);
    }

    const batchKeys = [...new Set(data.flatMap((qr) => [
      qr.batchId ? String(qr.batchId) : '',
      qr.batchNo !== null && qr.batchNo !== undefined ? String(qr.batchNo) : '',
    ]).filter(Boolean))];
    const batchRows = batchKeys.length
      ? await this.qrCodeRepository.query(
          `SELECT "batchId", "batchNo", "productId", "productName", "points"
           FROM "qr_code_batches"
           WHERE "batchId" = ANY($1::text[]) OR "batchNo"::text = ANY($1::text[])`,
          [batchKeys],
        )
      : [];
    const batchMap = new Map<string, any>();
    for (const batch of batchRows) {
      batchMap.set(String(batch.batchId), batch);
      if (batch.batchNo !== null && batch.batchNo !== undefined) {
        batchMap.set(String(batch.batchNo), batch);
      }
    }

    const enriched = data.map((qr) => {
      const batch = batchMap.get(String(qr.batchId ?? qr.batchNo ?? ''));
      const productPoints = qr.product?.points ?? 0;
      const effectivePoints = Number(batch?.points ?? qr.rewardPoints ?? productPoints);
      const user = qr.lastScannedBy ? userMap.get(qr.lastScannedBy) : undefined;
      const firstScan = firstScanMap.get(qr.id) ?? null;

      const adminName = qr.createdBy ? adminNameMap.get(qr.createdBy) : undefined;

      return {
        id: qr.id,
        code: qr.code,
        productId: batch?.productId ?? qr.productId,
        productName: batch?.productName ?? qr.productName,
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
    const qrCode = await this.qrCodeRepository
      .createQueryBuilder('qrCode')
      .leftJoinAndSelect('qrCode.product', 'product')
      .where('"qrCode"."id"::text = :candidate', { candidate: id })
      .orWhere('LOWER("qrCode"."code") = LOWER(:candidate)', { candidate: id })
      .orWhere('"qrCode"."legacyId"::text = :candidate', { candidate: id })
      .getOne();
    if (!qrCode) {
      throw new NotFoundException(`QR code "${id}" not found`);
    }

    const firstScan = (await this.getFirstScanMap([qrCode.id])).get(qrCode.id);
    const batchRows = await this.qrCodeRepository.query(
      `SELECT "productId", "productName", "points"
       FROM "qr_code_batches"
       WHERE "batchId" = $1 OR "batchNo"::text = $1
       LIMIT 1`,
      [String(qrCode.batchId ?? qrCode.batchNo ?? '')],
    );
    const batch = batchRows[0];

    return {
      qrCodeId: qrCode.id,
      code: qrCode.code,
      productId: batch?.productId ?? qrCode.productId,
      productName: batch?.productName ?? qrCode.productName ?? qrCode.product?.name ?? null,
      productSku: qrCode.product?.sku ?? null,
      batchId: qrCode.batchId,
      batchNo: qrCode.batchNo,
      points: Number(batch?.points ?? qrCode.rewardPoints ?? qrCode.product?.points ?? 0),
      status: qrCode.isScanned ? 'used' : qrCode.isActive ? 'active' : 'inactive',
      isScanned: qrCode.isScanned,
      scanCount: qrCode.scanCount,
      generatedAt: qrCode.createdAt,
      lastScannedAt: qrCode.lastScannedAt,
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
    const normalizedBatchId = String(batchId ?? '').trim();
    if (!normalizedBatchId) throw new BadRequestException('batchId is required');

    const assignments: string[] = [];
    const params: unknown[] = [normalizedBatchId];
    let product: Product | null = null;

    if (body.productId) {
      product = await this.productRepository.findOne({
        where: { id: body.productId },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      params.push(product.id, product.name);
      assignments.push(`"productId" = $${params.length - 1}`, `"productName" = $${params.length}`);
    }

    if (body.rewardPoints !== undefined) {
      const points = Number(body.rewardPoints);
      if (!Number.isFinite(points) || points < 0) {
        throw new BadRequestException(
          'rewardPoints must be a valid non-negative number',
        );
      }
      params.push(points);
      assignments.push(`"points" = $${params.length}`);
    }

    if (!assignments.length) {
      throw new BadRequestException('No batch fields provided to update');
    }

    const rows = await this.qrCodeRepository.query(
      `UPDATE "qr_code_batches"
       SET ${assignments.join(', ')}, "updatedAt" = now()
       WHERE "batchId" = $1 OR "batchNo"::text = $1
       RETURNING "batchId", "batchNo", "productId", "productName", "points", "qty"`,
      params,
    );
    if (!rows.length) {
      throw new NotFoundException(`QR batch "${normalizedBatchId}" not found`);
    }

    return {
      message: 'QR batch updated successfully',
      updated: 1,
      batch: rows[0],
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
