import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { PointsConfigDto } from './dto/points-config.dto';
import { Settings } from '../../database/entities/settings.entity';
import { PointsConfig } from '../../database/entities/points-config.entity';
import { Product } from '../../database/entities/product.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private settingsRepository: Repository<Settings>,
    @InjectRepository(PointsConfig)
    private pointsConfigRepository: Repository<PointsConfig>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private dataSource: DataSource,
  ) {}

  async findAll() {
    return this.settingsRepository.find({
      order: { key: 'ASC' },
    });
  }

  async findOne(key: string) {
    const setting = await this.settingsRepository.findOne({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    return setting;
  }

  async getRatingHistory() {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          r."userId" AS "userId",
          r."userRole" AS "userRole",
          r."rating" AS "rating",
          r."review" AS "review",
          r."createdAt" AS "createdAt",
          r."updatedAt" AS "updatedAt",
          COALESCE(e.name, d.name, u.name, c.name, 'Unknown User') AS "userName",
          COALESCE(e.phone, d.phone, u.phone, c.phone, '') AS "phone",
          COALESCE(e."electricianCode", d."dealerCode", u."userCode", c."counterboyCode", '') AS "code"
        FROM "app_ratings" r
        LEFT JOIN "electricians" e ON r."userId" = e.id
        LEFT JOIN "dealers" d ON r."userId" = d.id
        LEFT JOIN "app_users" u ON r."userId" = u.id
        LEFT JOIN "counterboys" c ON r."userId" = c.id
        ORDER BY r."updatedAt" DESC
      `);

      const data = rows.map((row: any) => ({
        userId: row.userId,
        userRole: row.userRole,
        userName: row.userName,
        phone: row.phone,
        code: row.code,
        rating: Number(row.rating ?? 0),
        review: row.review ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      return {
        data,
        total: data.length,
        summary: [1, 2, 3, 4, 5].reduce((acc, star) => {
          acc[star] = data.filter((item) => item.rating === star).length;
          return acc;
        }, {} as Record<number, number>),
      };
    } catch {
      return { data: [], total: 0, summary: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    }
  }

  async update(key: string, updateSettingDto: UpdateSettingDto, adminId: string) {
    const { value, description } = updateSettingDto;

    const existingSetting = await this.settingsRepository.findOne({
      where: { key },
    });

    if (existingSetting) {
      await this.settingsRepository.update(existingSetting.id, {
        value,
        description,
        updatedBy: adminId,
        updatedAt: new Date(),
      });
    } else {
      const newSetting = this.settingsRepository.create({
        id: randomUUID(),
        key,
        value,
        description,
        updatedBy: adminId,
        updatedAt: new Date(),
      });
      await this.settingsRepository.save(newSetting);
    }

    return this.findOne(key);
  }

  async configurePoints(pointsConfigDto: PointsConfigDto, adminId: string) {
    const { productId, basePoints, bonusPoints } = pointsConfigDto;

    // Verify product exists
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Update or create points config
    const existingConfig = await this.pointsConfigRepository.findOne({
      where: { productId },
    });

    if (existingConfig) {
      await this.pointsConfigRepository.update(existingConfig.id, {
        basePoints,
        bonusPoints,
      });
    } else {
      const newConfig = this.pointsConfigRepository.create({
        productId,
        productName: product.name,
        basePoints,
        bonusPoints,
      });
      await this.pointsConfigRepository.save(newConfig);
    }

    // Also update the product's points field
    await this.productRepository.update(productId, {
      points: basePoints + (bonusPoints || 0),
    });

    return {
      message: 'Points configuration updated successfully',
      productName: product.name,
      basePoints,
      bonusPoints,
      totalPoints: basePoints + (bonusPoints || 0),
    };
  }
}
