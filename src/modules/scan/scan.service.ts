import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Brackets, SelectQueryBuilder } from 'typeorm';
import { Scan } from '../../database/entities/scan.entity';
import { UserRole } from '../../common/enums';

@Injectable()
export class ScanService {
  constructor(
    @InjectRepository(Scan)
    private scanRepository: Repository<Scan>,
  ) {}

  async findAll(
    page: number = 1,
    limit: number = 20,
    userId?: string,
    productId?: string,
    role?: UserRole,
    dateFrom?: string,
    dateTo?: string,
    search?: string,
    mode?: string,
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.scanRepository.createQueryBuilder('scan');

    if (userId) queryBuilder.andWhere('scan.userId = :userId', { userId });
    if (productId) queryBuilder.andWhere('scan.productId = :productId', { productId });
    if (role) queryBuilder.andWhere('scan.role = :role', { role });
    if (mode) queryBuilder.andWhere('scan.mode = :mode', { mode });
    this.applySearchFilter(queryBuilder, search);
    if (dateFrom && dateTo) queryBuilder.andWhere('scan.scannedAt BETWEEN :dateFrom AND :dateTo', { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) });

    queryBuilder.orderBy('scan.scannedAt', 'DESC').skip(skip).take(limit);
    const [data, total] = await queryBuilder.getManyAndCount();

    // Helper to build a base query with the same filters (for aggregates)
    const baseQb = () => {
      const qb = this.scanRepository.createQueryBuilder('scan');
      if (userId) qb.andWhere('scan.userId = :userId', { userId });
      if (productId) qb.andWhere('scan.productId = :productId', { productId });
      if (role) qb.andWhere('scan.role = :role', { role });
      this.applySearchFilter(qb, search);
      if (dateFrom && dateTo) qb.andWhere('scan.scannedAt BETWEEN :dateFrom AND :dateTo', { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) });
      return qb;
    };

    // Total points across all filtered records
    const pointsResult = await baseQb().select('SUM(scan.points)', 'total').getRawOne();
    const totalPoints = parseInt(pointsResult?.total || '0');

    // Mode counts across all filtered records (excluding mode filter so we always get both)
    const modeQb = this.scanRepository.createQueryBuilder('scan');
    if (userId) modeQb.andWhere('scan.userId = :userId', { userId });
    if (productId) modeQb.andWhere('scan.productId = :productId', { productId });
    if (role) modeQb.andWhere('scan.role = :role', { role });
    this.applySearchFilter(modeQb, search);
    if (dateFrom && dateTo) modeQb.andWhere('scan.scannedAt BETWEEN :dateFrom AND :dateTo', { dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) });
    const modeCounts = await modeQb
      .select('scan.mode', 'mode')
      .addSelect('COUNT(*)', 'count')
      .groupBy('scan.mode')
      .getRawMany();
    const totalSingle = parseInt(modeCounts.find(r => r.mode === 'single')?.count || '0');
    const totalMulti = parseInt(modeCounts.find(r => r.mode === 'multi')?.count || '0');

    return {
      data: data.map(s => ({
        ...s,
        scannedAt: s.scannedAt instanceof Date ? s.scannedAt.toISOString() : s.scannedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalPoints,
      totalSingle,
      totalMulti,
    };
  }

  async findOne(id: string) {
    const scan = await this.scanRepository.findOne({
      where: { id },
      relations: ['electrician', 'dealer', 'product'],
    });

    if (!scan) {
      throw new NotFoundException('Scan not found');
    }

    return scan;
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalScans, todayScans, yesterdayScans, weekScans] = await Promise.all([
      this.scanRepository.count(),
      this.scanRepository.count({ where: { scannedAt: Between(today, new Date()) } }),
      this.scanRepository.count({ where: { scannedAt: Between(yesterday, today) } }),
      this.scanRepository.count({ where: { scannedAt: Between(weekAgo, new Date()) } }),
    ]);

    const electricianScans = await this.scanRepository.count({ where: { role: UserRole.ELECTRICIAN } });
    const dealerScans = await this.scanRepository.count({ where: { role: UserRole.DEALER } });

    return {
      totalScans,
      todayScans,
      yesterdayScans,
      weekScans,
      electricianScans,
      dealerScans,
      growthRate: yesterdayScans > 0 ? ((todayScans - yesterdayScans) / yesterdayScans) * 100 : 0,
    };
  }

  /**
   * Scan records retain a stable user UUID but not a copied phone/code. Search
   * the linked role table as well so the admin can reliably find an
   * electrician by phone number, electrician code, or full UUID.
   */
  private applySearchFilter(queryBuilder: SelectQueryBuilder<Scan>, search?: string) {
    if (!search?.trim()) return;

    const searchPattern = `%${search.trim()}%`;
    queryBuilder.andWhere(new Brackets((qb) => {
      qb.where('scan.userName ILIKE :searchPattern', { searchPattern })
        .orWhere('scan.productName ILIKE :searchPattern', { searchPattern })
        .orWhere('scan.userId ILIKE :searchPattern', { searchPattern })
        .orWhere(`EXISTS (
          SELECT 1 FROM electricians electrician
          WHERE electrician.id = scan.userId
            AND (electrician.phone ILIKE :searchPattern OR electrician."electricianCode" ILIKE :searchPattern)
        )`, { searchPattern })
        .orWhere(`EXISTS (
          SELECT 1 FROM dealers dealer
          WHERE dealer.id = scan.userId
            AND (dealer.phone ILIKE :searchPattern OR dealer."dealerCode" ILIKE :searchPattern)
        )`, { searchPattern });
    }));
  }
}
