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

  async globalSearch(query: string, requestedLimit = 8) {
    const term = query?.trim();
    if (!term || term.length < 2) return { query: term ?? '', results: [], total: 0 };

    const limit = Math.min(Math.max(Number(requestedLimit) || 8, 1), 20);
    const pattern = `%${term}%`;
    const normalizedTerm = term.replace(/\.png$/i, '');
    const digits = term.replace(/\D/g, '').slice(-10);

    if (digits.length >= 4) {
      const rows = await this.dataSource.query(
        `WITH matches AS (
          (SELECT 'Electrician'::text AS "type", e.id::text AS "id", e.name AS "title",
                  concat_ws(' • ', e."electricianCode", e.phone, e.city) AS "subtitle",
                  'electricians'::text AS "page", e."joinedDate" AS "sortDate"
           FROM electricians e
           WHERE regexp_replace(COALESCE(e.phone, ''), '\\D', '', 'g') LIKE '%' || $1 || '%'
              OR LOWER(COALESCE(e."electricianCode", '')) = LOWER($2)
           ORDER BY e."joinedDate" DESC NULLS LAST
           LIMIT $3)
          UNION ALL
          (SELECT 'Dealer', d.id::text, d.name,
                  concat_ws(' • ', d."dealerCode", d.phone, d.town), 'dealers', d."joinedDate"
           FROM dealers d
           WHERE regexp_replace(COALESCE(d.phone, ''), '\\D', '', 'g') LIKE '%' || $1 || '%'
              OR LOWER(COALESCE(d."dealerCode", '')) = LOWER($2)
           ORDER BY d."joinedDate" DESC NULLS LAST
           LIMIT $3)
          UNION ALL
          (SELECT 'Customer', u.id::text, u.name,
                  concat_ws(' • ', u."userCode", u.phone, u.city), 'app-users', u."joinedDate"
           FROM app_users u
           WHERE regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE '%' || $1 || '%'
              OR LOWER(COALESCE(u."userCode", '')) = LOWER($2)
           ORDER BY u."joinedDate" DESC NULLS LAST
           LIMIT $3)
          UNION ALL
          (SELECT 'Counter Boy', c.id::text, c.name,
                  concat_ws(' • ', c."counterboyCode", c.phone, c.city), 'counterboys', c."joinedDate"
           FROM counterboys c
           WHERE regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE '%' || $1 || '%'
              OR LOWER(COALESCE(c."counterboyCode", '')) = LOWER($2)
           ORDER BY c."joinedDate" DESC NULLS LAST
           LIMIT $3)
          UNION ALL
          (SELECT 'QR Code', q.id::text, q.code,
                  concat_ws(' • ', q."productName", 'Batch ' || COALESCE(q."batchNo"::text, '-'),
                    CASE WHEN q."isScanned" THEN 'Scanned' ELSE 'Available' END), 'qr-codes', q."createdAt"
           FROM qr_codes q
           WHERE q."legacyId"::text = $2
              OR q."batchNo"::text = $2
           ORDER BY q."createdAt" DESC NULLS LAST
           LIMIT $3)
        )
        SELECT "type", "id", "title", "subtitle", "page"
        FROM matches
        ORDER BY "sortDate" DESC NULLS LAST, "title" ASC
        LIMIT $3`,
        [digits, normalizedTerm, limit],
      );

      return { query: term, results: rows, total: rows.length };
    }

    const rows = await this.dataSource.query(
      `WITH matches AS (
        (SELECT 'Electrician'::text AS "type", e.id::text AS "id", e.name AS "title",
                concat_ws(' • ', e."electricianCode", e.phone, e.city) AS "subtitle",
                'electricians'::text AS "page", e."joinedDate" AS "sortDate"
         FROM electricians e
         WHERE concat_ws(' ', e.name, e.phone, e."electricianCode", e.city, e.district, e.state) ILIKE $1
            OR ($4 <> '' AND regexp_replace(COALESCE(e.phone, ''), '\\D', '', 'g') LIKE '%' || $4 || '%')
            OR LOWER(COALESCE(e."electricianCode", '')) = LOWER($3)
         ORDER BY e."joinedDate" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'Dealer', d.id::text, d.name,
                concat_ws(' • ', d."dealerCode", d.phone, d.town), 'dealers', d."joinedDate"
         FROM dealers d
         WHERE concat_ws(' ', d.name, d.phone, d."dealerCode", d.town, d.district, d.state) ILIKE $1
            OR ($4 <> '' AND regexp_replace(COALESCE(d.phone, ''), '\\D', '', 'g') LIKE '%' || $4 || '%')
            OR LOWER(COALESCE(d."dealerCode", '')) = LOWER($3)
         ORDER BY d."joinedDate" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'Customer', u.id::text, u.name,
                concat_ws(' • ', u."userCode", u.phone, u.city), 'app-users', u."joinedDate"
         FROM app_users u
         WHERE concat_ws(' ', u.name, u.phone, u."userCode", u.email, u.city, u.district, u.state) ILIKE $1
            OR ($4 <> '' AND regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE '%' || $4 || '%')
            OR LOWER(COALESCE(u."userCode", '')) = LOWER($3)
         ORDER BY u."joinedDate" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'Counter Boy', c.id::text, c.name,
                concat_ws(' • ', c."counterboyCode", c.phone, c.city), 'counterboys', c."joinedDate"
         FROM counterboys c
         WHERE concat_ws(' ', c.name, c.phone, c."counterboyCode", c.city, c.district, c.state) ILIKE $1
            OR ($4 <> '' AND regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE '%' || $4 || '%')
            OR LOWER(COALESCE(c."counterboyCode", '')) = LOWER($3)
         ORDER BY c."joinedDate" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'Product', p.id::text, p.name,
                concat_ws(' • ', p.sku, p.category, p.sub), 'products', p."createdAt"
         FROM products p
         WHERE concat_ws(' ', p.name, p.sku, p.category, p.sub, p.description) ILIKE $1
            OR LOWER(COALESCE(p.sku, '')) = LOWER($3)
         ORDER BY p."createdAt" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'QR Code', q.id::text, q.code,
                concat_ws(' • ', q."productName", 'Batch ' || COALESCE(q."batchNo"::text, '-'),
                  CASE WHEN q."isScanned" THEN 'Scanned' ELSE 'Available' END), 'qr-codes', q."createdAt"
         FROM qr_codes q
         WHERE LOWER(q.code) = LOWER($3)
            OR q."legacyId"::text = $3
            OR q."batchNo"::text = $3
         ORDER BY q."createdAt" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'Product Order', o.id::text, o."productName",
                concat_ws(' • ', o."userName", o."userPhone", o."userCode", o.status::text),
                'product-orders', o."orderedAt"
         FROM product_orders o
         WHERE concat_ws(' ', o.id::text, o."productName", o."userName", o."userPhone", o."userCode",
                          o."trackingNumber", o.status::text) ILIKE $1
            OR ($4 <> '' AND regexp_replace(COALESCE(o."userPhone", ''), '\\D', '', 'g') LIKE '%' || $4 || '%')
         ORDER BY o."orderedAt" DESC NULLS LAST
         LIMIT $2)
        UNION ALL
        (SELECT 'Gift Order', g.id::text, g."giftName",
                concat_ws(' • ', g."userName", g."userCode", g.status::text), 'gift-orders', g."orderedAt"
         FROM gift_orders g
         WHERE concat_ws(' ', g.id::text, g."giftName", g."userName", g."userCode",
                          g."trackingNumber", g.status::text) ILIKE $1
         ORDER BY g."orderedAt" DESC NULLS LAST
         LIMIT $2)
      )
      SELECT "type", "id", "title", "subtitle", "page"
      FROM matches
      ORDER BY "sortDate" DESC NULLS LAST, "title" ASC
      LIMIT $2`,
      [pattern, limit, normalizedTerm, digits],
    );

    return { query: term, results: rows, total: rows.length };
  }

  private async globalSearchLegacy(query: string, requestedLimit = 8) {
    const term = query?.trim();
    if (!term || term.length < 2) return { query: term ?? '', results: [], total: 0 };

    const limit = Math.min(Math.max(Number(requestedLimit) || 8, 1), 20);
    const pattern = `%${term}%`;
    const rows = await this.dataSource.query(
      `WITH matches AS (
        SELECT 'Electrician'::text AS "type", e.id::text AS "id", e.name AS "title",
               concat_ws(' • ', e."electricianCode", e.phone, e.city) AS "subtitle",
               'electricians'::text AS "page", e."joinedDate" AS "sortDate"
        FROM electricians e
        WHERE concat_ws(' ', e.name, e.phone, e."electricianCode", e.city, e.district, e.state) ILIKE $1
        UNION ALL
        SELECT 'Dealer', d.id::text, d.name,
               concat_ws(' • ', d."dealerCode", d.phone, d.town), 'dealers', d."joinedDate"
        FROM dealers d
        WHERE concat_ws(' ', d.name, d.phone, d."dealerCode", d.town, d.district, d.state) ILIKE $1
        UNION ALL
        SELECT 'Customer', u.id::text, u.name,
               concat_ws(' • ', u."userCode", u.phone, u.city), 'app-users', u."joinedDate"
        FROM app_users u
        WHERE concat_ws(' ', u.name, u.phone, u."userCode", u.email, u.city, u.district, u.state) ILIKE $1
        UNION ALL
        SELECT 'Counter Boy', c.id::text, c.name,
               concat_ws(' • ', c."counterboyCode", c.phone, c.city), 'counterboys', c."joinedDate"
        FROM counterboys c
        WHERE concat_ws(' ', c.name, c.phone, c."counterboyCode", c.city, c.district, c.state) ILIKE $1
        UNION ALL
        SELECT 'Product', p.id::text, p.name,
               concat_ws(' • ', p.sku, p.category, p.sub), 'products', p."createdAt"
        FROM products p
        WHERE concat_ws(' ', p.name, p.sku, p.category, p.sub, p.description) ILIKE $1
        UNION ALL
        SELECT 'QR Code', q.id::text, q.code,
               concat_ws(' • ', q."productName", 'Batch ' || COALESCE(q."batchNo"::text, '-'),
                 CASE WHEN q."isScanned" THEN 'Scanned' ELSE 'Available' END), 'qr-codes', q."createdAt"
        FROM qr_codes q
        WHERE LOWER(q.code) = LOWER($3)
           OR q."legacyId"::text = $3
           OR q."batchNo"::text = $3
        UNION ALL
        SELECT 'Product Order', o.id::text, o."productName",
               concat_ws(' • ', o."userName", o."userPhone", o."userCode", o.status::text),
               'product-orders', o."orderedAt"
        FROM product_orders o
        WHERE concat_ws(' ', o.id::text, o."productName", o."userName", o."userPhone", o."userCode",
                         o."trackingNumber", o.status::text) ILIKE $1
        UNION ALL
        SELECT 'Gift Order', g.id::text, g."giftName",
               concat_ws(' • ', g."userName", g."userCode", g.status::text), 'gift-orders', g."orderedAt"
        FROM gift_orders g
        WHERE concat_ws(' ', g.id::text, g."giftName", g."userName", g."userCode",
                         g."trackingNumber", g.status::text) ILIKE $1
      )
      SELECT "type", "id", "title", "subtitle", "page"
      FROM matches
      ORDER BY "sortDate" DESC NULLS LAST, "title" ASC
      LIMIT $2`,
      [pattern, limit, term.replace(/\.png$/i, '')],
    );

    return { query: term, results: rows, total: rows.length };
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
        LEFT JOIN "electricians" e ON r."userId" = e.id::text
        LEFT JOIN "dealers" d ON r."userId" = d.id::text
        LEFT JOIN "app_users" u ON r."userId" = u.id::text
        LEFT JOIN "counterboys" c ON r."userId" = c.id::text
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
