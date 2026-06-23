import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateGiftProductDto } from './dto/create-gift-product.dto';
import { UpdateGiftProductDto } from './dto/update-gift-product.dto';
import { Product } from '../../database/entities/product.entity';
import { GiftOrder, GiftOrderStatus } from '../../database/entities/gift-order.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { RedemptionService } from '../redemption/redemption.service';
import { RedemptionStatus } from '../../common/enums';

@Injectable()
export class GiftService {
  private giftOrderSchemaPromise: Promise<void> | null = null;

  constructor(
    private dataSource: DataSource,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(GiftOrder)
    private giftOrderRepository: Repository<GiftOrder>,
    @InjectRepository(Redemption)
    private redemptionRepository: Repository<Redemption>,
    private redemptionService: RedemptionService,
  ) {}

  private async ensureGiftOrderSchema() {
    if (!this.giftOrderSchemaPromise) {
      this.giftOrderSchemaPromise = this.dataSource.query(`
        ALTER TABLE "gift_orders"
        ADD COLUMN IF NOT EXISTS "courierName" varchar,
        ADD COLUMN IF NOT EXISTS "deliveryNotes" text,
        ADD COLUMN IF NOT EXISTS "dispatchedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz;
      `).catch((error) => {
        this.giftOrderSchemaPromise = null;
        throw error;
      });
    }
    await this.giftOrderSchemaPromise;
  }

  // ─── Gift Products ────────────────────────────────────────────────────────

  async getProducts(page: number = 1, limit: number = 20, type?: string) {
    const skip = (page - 1) * limit;

    const qb = this.productRepository
      .createQueryBuilder('p')
      .where('p.category = :cat', { cat: 'gift' });

    if (type && type !== 'all') {
      qb.andWhere('p.subCategory = :type', { type });
    }

    qb.orderBy('p.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    const mapped = data.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image ?? '',
      pointsRequired: p.points ?? 0,
      stock: p.stock ?? 0,
      status: p.isActive ? 'active' : 'inactive',
      type: p.subCategory ?? 'electrician',
    }));

    return { data: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createProduct(createGiftProductDto: CreateGiftProductDto) {
    const pointsValue =
      (createGiftProductDto as any).pointsRequired ??
      createGiftProductDto.points ??
      0;

    const giftProduct = this.productRepository.create({
      name: createGiftProductDto.name,
      sub: createGiftProductDto.sub ?? createGiftProductDto.name,
      category: 'gift',
      subCategory: (createGiftProductDto as any).type ?? createGiftProductDto.subCategory ?? 'electrician',
      image: createGiftProductDto.image,
      points: pointsValue,
      stock: createGiftProductDto.stock ?? 0,
      isActive: (createGiftProductDto as any).status
        ? (createGiftProductDto as any).status === 'active'
        : (createGiftProductDto.isActive ?? true),
      price: createGiftProductDto.price ?? 0,
      mrp: createGiftProductDto.mrp,
      sku: createGiftProductDto.sku,
      weight: createGiftProductDto.weight,
      description: createGiftProductDto.description,
      badge: createGiftProductDto.badge,
    });

    const saved = await this.productRepository.save(giftProduct);
    return {
      id: saved.id,
      name: saved.name,
      image: saved.image ?? '',
      pointsRequired: saved.points ?? 0,
      stock: saved.stock ?? 0,
      status: saved.isActive ? 'active' : 'inactive',
      type: saved.subCategory ?? 'electrician',
    };
  }

  async updateProduct(id: string, updateGiftProductDto: UpdateGiftProductDto) {
    const product = await this.productRepository.findOne({
      where: { id, category: 'gift' },
    });

    if (!product) {
      throw new NotFoundException('Gift product not found');
    }

    const updateData: Partial<Product> = {};
    if (updateGiftProductDto.name !== undefined) updateData.name = updateGiftProductDto.name;
    if (updateGiftProductDto.image !== undefined) updateData.image = updateGiftProductDto.image;
    if (updateGiftProductDto.stock !== undefined) updateData.stock = updateGiftProductDto.stock;
    if ((updateGiftProductDto as any).pointsRequired !== undefined)
      updateData.points = (updateGiftProductDto as any).pointsRequired;
    if (updateGiftProductDto.points !== undefined) updateData.points = updateGiftProductDto.points;
    if ((updateGiftProductDto as any).status !== undefined)
      updateData.isActive = (updateGiftProductDto as any).status === 'active';
    if (updateGiftProductDto.isActive !== undefined) updateData.isActive = updateGiftProductDto.isActive;
    if ((updateGiftProductDto as any).type !== undefined)
      updateData.subCategory = (updateGiftProductDto as any).type;

    await this.productRepository.update(id, updateData);
    const updated = await this.productRepository.findOne({ where: { id } });
    return {
      id: updated!.id,
      name: updated!.name,
      image: updated!.image ?? '',
      pointsRequired: updated!.points ?? 0,
      stock: updated!.stock ?? 0,
      status: updated!.isActive ? 'active' : 'inactive',
      type: updated!.subCategory ?? 'electrician',
    };
  }

  async deleteProduct(id: string) {
    const product = await this.productRepository.findOne({
      where: { id, category: 'gift' },
    });

    if (!product) {
      throw new NotFoundException('Gift product not found');
    }

    await this.productRepository.remove(product);
    return { message: 'Gift product deleted successfully' };
  }

  // ─── Gift Orders ──────────────────────────────────────────────────────────

  async getOrders(
    page: number = 1,
    limit: number = 20,
    status?: string,
    role?: string,
  ) {
    await this.ensureGiftOrderSchema();
    const skip = (page - 1) * limit;

    const qb = this.giftOrderRepository.createQueryBuilder('o');

    if (status && status !== 'all') {
      qb.andWhere('o.status = :status', { status });
    }

    if (role && role !== 'all') {
      qb.andWhere('o.role = :role', { role });
    }

    qb.orderBy('o.orderedAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((o) => ({
        id: o.id,
        type: o.role,
        userName: o.userName,
        userCode: o.userCode ?? '',
        dealerName: o.dealerName ?? '—',
        giftName: o.giftName,
        giftImage: o.giftImage ?? '',
        pointsUsed: o.pointsUsed,
        orderedAt: o.orderedAt,
        status: o.status,
        shippingAddress: o.shippingAddress,
        trackingNumber: o.trackingNumber,
        courierName: o.courierName,
        deliveryNotes: o.deliveryNotes,
        dispatchedAt: o.dispatchedAt,
        deliveredAt: o.deliveredAt,
        rejectionReason: o.rejectionReason,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createOrder(body: {
    userId: string;
    userName: string;
    userCode?: string;
    dealerName?: string;
    role: string;
    giftProductId: string;
    shippingAddress?: string;
  }) {
    const giftProduct = await this.productRepository.findOne({
      where: { id: body.giftProductId, category: 'gift' },
    });

    if (!giftProduct) {
      throw new NotFoundException('Gift product not found');
    }

    if (giftProduct.stock <= 0) {
      throw new BadRequestException('Gift product is out of stock');
    }

    const order = this.giftOrderRepository.create({
      userId: body.userId,
      userName: body.userName,
      userCode: body.userCode,
      dealerName: body.dealerName,
      role: body.role as any,
      giftProductId: body.giftProductId,
      giftName: giftProduct.name,
      giftImage: giftProduct.image ?? '',
      pointsUsed: giftProduct.points,
      status: GiftOrderStatus.PENDING,
      shippingAddress: body.shippingAddress,
    });

    const saved = await this.giftOrderRepository.save(order);

    // Decrement stock
    await this.productRepository.decrement({ id: body.giftProductId }, 'stock', 1);

    return saved;
  }

  async updateOrderStatus(id: string, status: string, extra?: { rejectionReason?: string; trackingNumber?: string; courierName?: string; deliveryNotes?: string; processedBy?: string }) {
    await this.ensureGiftOrderSchema();
    const order = await this.giftOrderRepository.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Gift order not found');
    }

    const validStatuses = Object.values(GiftOrderStatus);
    if (!validStatuses.includes(status as GiftOrderStatus)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const updateData: Partial<GiftOrder> = {
      status: status as GiftOrderStatus,
    };

    if (extra?.rejectionReason) updateData.rejectionReason = extra.rejectionReason;
    if (extra?.trackingNumber) updateData.trackingNumber = extra.trackingNumber;
    if (extra?.courierName) updateData.courierName = extra.courierName;
    if (extra?.deliveryNotes) updateData.deliveryNotes = extra.deliveryNotes;
    if (extra?.processedBy) updateData.processedBy = extra.processedBy;

    if (status === GiftOrderStatus.APPROVED || status === GiftOrderStatus.REJECTED) {
      updateData.processedAt = new Date();
    }
    if (status === GiftOrderStatus.SHIPPED) {
      updateData.dispatchedAt = order.dispatchedAt ?? new Date();
      updateData.deliveryNotes = extra?.deliveryNotes || 'Gift order dispatched. Tracking details shared with customer.';
    }
    if (status === GiftOrderStatus.DELIVERED) {
      updateData.deliveredAt = order.deliveredAt ?? new Date();
      updateData.deliveryNotes = extra?.deliveryNotes || 'Gift delivered successfully.';
    }
    if (status === GiftOrderStatus.REJECTED) {
      updateData.deliveryNotes = extra?.deliveryNotes || extra?.rejectionReason || 'Gift order rejected by admin.';
    }

    // If rejected, restore stock and refund points via Redemption
    if (status === GiftOrderStatus.REJECTED && order.status !== GiftOrderStatus.REJECTED) {
      await this.productRepository.increment({ id: order.giftProductId }, 'stock', 1);

      const redemption = await this.redemptionRepository.findOne({
        where: {
          userId: order.userId,
          points: order.pointsUsed,
          type: 'gift',
          status: RedemptionStatus.PENDING,
        },
        order: { requestedAt: 'DESC' },
      });
      if (redemption) {
        await this.redemptionService.reject(
          redemption.id,
          extra?.rejectionReason || 'Gift order rejected by admin',
          extra?.processedBy || 'admin',
        );
      }
    }

    await this.giftOrderRepository.update(id, updateData);

    const updated = await this.giftOrderRepository.findOne({ where: { id } });
    return {
      message: 'Order status updated successfully',
      orderId: id,
      newStatus: updated!.status,
      updatedAt: updated!.updatedAt,
    };
  }

  async deleteOrder(id: string) {
    const order = await this.giftOrderRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Gift order not found');
    await this.giftOrderRepository.remove(order);
    return { message: 'Gift order deleted successfully' };
  }
}
