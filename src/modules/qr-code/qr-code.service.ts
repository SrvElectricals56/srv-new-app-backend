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

@Injectable()
export class QrCodeService implements OnModuleInit {
  private readonly logger = new Logger(QrCodeService.name);
  private schemaEnsured = false;

  constructor(
    @InjectRepository(QrCode)
    private qrCodeRepository: Repository<QrCode>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async onModuleInit() {
    await this.ensureLegacyColumns();
  }

  async generate(generateQrCodeDto: GenerateQrCodeDto) {
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

    const frozenRewardPoints = Number(
      rewardPoints ?? product.points ?? 0,
    );
    if (!Number.isFinite(frozenRewardPoints) || frozenRewardPoints < 0) {
      throw new BadRequestException(
        'rewardPoints must be a valid non-negative number',
      );
    }

    const batchNo = await this.getNextBatchNo();
    const batchId = String(batchNo);
    const generatedCodes = new Set<string>();
    const qrEntities: Partial<QrCode>[] = [];

    for (let i = 0; i < quantity; i++) {
      const sequenceNo = i + 1;
      let code = this.generateFixedLengthQrCode(batchNo, sequenceNo);
      while (generatedCodes.has(code)) {
        code = this.generateFixedLengthQrCode(batchNo, sequenceNo);
      }

      generatedCodes.add(code);

      qrEntities.push({
        code,
        productId,
        productName: product.name,
        qrImageUrl: this.buildQrImageUrl(code),
        isScanned: false,
        isActive: true,
        batchId,
        batchNo,
        sequenceNo,
        rewardPoints: frozenRewardPoints,
      });
    }

    const chunkSize = 500;
    const savedCodes: QrCode[] = [];
    for (let i = 0; i < qrEntities.length; i += chunkSize) {
      const chunk = qrEntities.slice(i, i + chunkSize);
      const saved = await this.qrCodeRepository.save(chunk as QrCode[]);
      savedCodes.push(...saved);
    }

    return {
      message: `${quantity} QR codes generated successfully`,
      batchId,
      batchNo,
      productName: product.name,
      sku: product.sku,
      points: frozenRewardPoints,
      codes: savedCodes,
    };
  }

  async getStats() {
    await this.ensureLegacyColumns();

    const [total, active, used] = await Promise.all([
      this.qrCodeRepository.count(),
      this.qrCodeRepository.count({ where: { isScanned: false } }),
      this.qrCodeRepository.count({ where: { isScanned: true } }),
    ]);
    return { total, active, used };
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

    const enriched = data.map((qr) => {
      const productPoints = qr.product?.points ?? 0;
      const effectivePoints = qr.rewardPoints ?? productPoints;

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
