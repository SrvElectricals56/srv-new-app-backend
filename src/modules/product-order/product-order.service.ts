import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProductOrder, ProductOrderStatus } from '../../database/entities/product-order.entity';
import { PointsConfig } from '../../database/entities/points-config.entity';
import { Product } from '../../database/entities/product.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { TransactionType, TransactionSource, UserRole } from '../../common/enums';

@Injectable()
export class ProductOrderService {
  constructor(
    @InjectRepository(ProductOrder)
    private productOrderRepository: Repository<ProductOrder>,
    @InjectRepository(PointsConfig)
    private pointsConfigRepository: Repository<PointsConfig>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
    private dataSource: DataSource,
  ) {}

  private async ensureDeliveryColumns() {
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "estimatedDeliveryAt" timestamptz
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "dispatchedAt" timestamptz
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "rejectedAt" timestamptz
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "refundStatus" varchar
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "refundMessage" text
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "deliveryNotes" text
    `);
    await this.productOrderRepository.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "courierName" varchar
    `);
    await this.productOrderRepository.query(`
      DO $$
      DECLARE
        source_enum regtype;
      BEGIN
        SELECT a.atttypid::regtype
        INTO source_enum
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE n.nspname = 'public'
          AND c.relname = 'wallet_transactions'
          AND a.attname = 'source'
          AND t.typtype = 'e'
          AND NOT a.attisdropped
        LIMIT 1;

        IF source_enum IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_enum
            WHERE enumtypid = source_enum::oid
              AND enumlabel = 'purchase'
          )
        THEN
          EXECUTE format('ALTER TYPE %s ADD VALUE %L', source_enum, 'purchase');
        END IF;
      END $$;
    `);
  }

  private estimateDeliveryDate(from = new Date()) {
    const estimated = new Date(from);
    estimated.setDate(estimated.getDate() + 5);
    return estimated;
  }

  private mapOrder(o: ProductOrder) {
    return {
      id: o.id,
      userId: o.userId,
      userRole: o.userRole,
      userName: o.userName,
      userPhone: o.userPhone,
      userCode: o.userCode,
      productId: o.productId,
      productName: o.productName,
      productImage: o.productImage,
      quantity: o.quantity,
      price: parseFloat(o.price.toString()),
      total: parseFloat(o.price.toString()) * o.quantity,
      status: o.status,
      shippingAddress: o.shippingAddress,
      trackingNumber: o.trackingNumber,
      courierName: o.courierName,
      rejectionReason: o.rejectionReason,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      razorpayPaymentId: o.razorpayPaymentId,
      paidAt: o.paidAt,
      estimatedDeliveryAt: o.estimatedDeliveryAt,
      dispatchedAt: o.dispatchedAt,
      deliveredAt: o.deliveredAt,
      rejectedAt: o.rejectedAt,
      refundStatus: o.refundStatus,
      refundMessage: o.refundMessage,
      deliveryNotes: o.deliveryNotes,
      orderedAt: o.orderedAt,
      updatedAt: o.updatedAt,
    };
  }

  async findAll(page = 1, limit = 20, status?: string, role?: string, search?: string) {
    await this.ensureDeliveryColumns();
    const qb = this.productOrderRepository.createQueryBuilder('o')
      .where('(o.paymentMethod <> :razorpay OR o.paymentStatus = :paid)', { razorpay: 'razorpay', paid: 'paid' })
      .orderBy('o.orderedAt', 'DESC');

    if (status && status !== 'all') {
      qb.andWhere('o.status = :status', { status });
    }
    if (role && role !== 'all') {
      qb.andWhere('o.userRole = :role', { role });
    }
    if (search) {
      qb.andWhere(
        '(o.userName ILIKE :search OR o.userPhone ILIKE :search OR o.productName ILIKE :search OR o.id ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await qb.getCount();
    const data = await qb.skip((page - 1) * limit).take(limit).getMany();

    const mapped = data.map((o) => this.mapOrder(o));

    return { data: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    await this.ensureDeliveryColumns();
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order || (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid')) {
      throw new NotFoundException('Product order not found');
    }
    return this.mapOrder(order);
  }

  async updateStatus(id: string, status: string, extra?: { rejectionReason?: string; trackingNumber?: string; courierName?: string }) {
    await this.ensureDeliveryColumns();
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order || (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid')) {
      throw new NotFoundException('Product order not found');
    }

    const validStatuses = Object.values(ProductOrderStatus);
    if (!validStatuses.includes(status as ProductOrderStatus)) {
      throw new BadRequestException(`Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`);
    }

    const transitions: Record<string, string[]> = {
      [ProductOrderStatus.PENDING]: [ProductOrderStatus.APPROVED, ProductOrderStatus.REJECTED, ProductOrderStatus.SHIPPED, ProductOrderStatus.DELIVERED],
      [ProductOrderStatus.APPROVED]: [ProductOrderStatus.PENDING, ProductOrderStatus.SHIPPED, ProductOrderStatus.REJECTED, ProductOrderStatus.DELIVERED],
      [ProductOrderStatus.SHIPPED]: [ProductOrderStatus.APPROVED, ProductOrderStatus.DELIVERED, ProductOrderStatus.REJECTED],
      [ProductOrderStatus.DELIVERED]: [ProductOrderStatus.SHIPPED, ProductOrderStatus.REJECTED],
      [ProductOrderStatus.REJECTED]: [ProductOrderStatus.PENDING, ProductOrderStatus.APPROVED],
    };

    const allowed = transitions[order.status] ?? [];
    if (status !== order.status && !allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updateData: Partial<ProductOrder> = { status: status as ProductOrderStatus };
    if (!order.estimatedDeliveryAt && status !== ProductOrderStatus.REJECTED) {
      updateData.estimatedDeliveryAt = this.estimateDeliveryDate(order.paidAt ?? order.orderedAt ?? new Date());
    }
    if (extra?.rejectionReason && (status === ProductOrderStatus.REJECTED)) {
      updateData.rejectionReason = extra.rejectionReason;
    }
    if (extra?.trackingNumber) {
      updateData.trackingNumber = extra.trackingNumber;
    }
    if (extra?.courierName) {
      updateData.courierName = extra.courierName;
    }
    if (status === ProductOrderStatus.PENDING) {
      updateData.deliveryNotes = 'Payment done. Order is waiting for dispatch.';
    }
    if (status === ProductOrderStatus.APPROVED) {
      updateData.deliveryNotes = 'Order confirmed and ready for packing.';
    }
    if (status === ProductOrderStatus.SHIPPED) {
      updateData.dispatchedAt = order.dispatchedAt ?? new Date();
      updateData.deliveryNotes = extra?.courierName
        ? `Order dispatched through ${extra.courierName}.`
        : 'Order dispatched. Delivery partner update is awaited.';
    }
    if (status === ProductOrderStatus.DELIVERED) {
      updateData.deliveredAt = order.deliveredAt ?? new Date();
      updateData.deliveryNotes = 'Order delivered successfully.';
    }
    if (status === ProductOrderStatus.REJECTED) {
      const isPaid = order.paymentStatus === 'paid';
      updateData.rejectedAt = new Date();
      updateData.refundStatus = isPaid ? 'pending' : null;
      updateData.refundMessage = isPaid
        ? 'Order rejected. Your money will be refunded within 2 business days.'
        : 'Order rejected before payment confirmation.';
      updateData.deliveryNotes = isPaid
        ? 'Rejected by admin. Refund will be processed within 2 business days.'
        : 'Rejected by admin.';
      updateData.rejectionReason = extra?.rejectionReason || order.rejectionReason || 'Rejected by admin';
    }

    // ── Credit points to user/counterboy wallet on delivery ──
    if (
      status === ProductOrderStatus.DELIVERED &&
      (order.userRole === UserRole.USER || order.userRole === UserRole.COUNTERBOY)
    ) {
      const pointsConfig = await this.pointsConfigRepository.findOne({
        where: { productId: order.productId, isActive: true },
      });
      let pointsPerUnit = pointsConfig?.basePoints ?? 0;
      if (pointsPerUnit === 0) {
        const product = await this.productRepository.findOne({ where: { id: order.productId } });
        pointsPerUnit = product?.points ?? 0;
      }
      const totalPoints = pointsPerUnit * order.quantity;

      if (totalPoints > 0) {
        await this.dataSource.transaction(async (manager) => {
          await manager.getRepository(ProductOrder).update(id, updateData);

          let user: any;
          if (order.userRole === UserRole.USER) {
            user = await manager.getRepository(AppUser).findOne({ where: { id: order.userId } });
          } else {
            user = await manager.getRepository(CounterBoy).findOne({ where: { id: order.userId } });
          }
          if (!user) return;

          const balanceBefore = Number(user.walletBalance ?? 0);
          const newBalance = balanceBefore + totalPoints;
          const newTotalPoints = Math.max(0, newBalance);

          const updateUserData: any = {
            walletBalance: newBalance,
            totalPoints: newTotalPoints,
          };

          updateUserData.tier = this.calculateTier(newTotalPoints);

          if (order.userRole === UserRole.USER) {
            await manager.getRepository(AppUser).update(order.userId, updateUserData);
          } else {
            await manager.getRepository(CounterBoy).update(order.userId, updateUserData);
          }

          await manager.getRepository(Wallet).save(
            manager.getRepository(Wallet).create({
              userId: order.userId,
              userRole: order.userRole,
              type: TransactionType.CREDIT,
              source: TransactionSource.PURCHASE,
              amount: totalPoints,
              balanceBefore,
              balanceAfter: newBalance,
              description: `Product purchase: ${order.productName} × ${order.quantity}`,
              referenceId: order.id,
              referenceType: 'product_order',
            }),
          );
        });

        return { message: 'Order delivered & points credited successfully' };
      }
    }

    await this.productOrderRepository.update(id, updateData);
    return {
      message: status === ProductOrderStatus.REJECTED
        ? 'Order rejected. Refund message sent to customer.'
        : 'Order status updated successfully',
      refundMessage: updateData.refundMessage,
    };
  }

  private calculateTier(points: number): string {
    if (points >= 10000) return 'Diamond';
    if (points >= 5001) return 'Platinum';
    if (points >= 1001) return 'Gold';
    return 'Silver';
  }

  async remove(id: string) {
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order || (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid')) {
      throw new NotFoundException('Product order not found');
    }
    await this.productOrderRepository.remove(order);
    return { message: 'Product order deleted successfully' };
  }

  async getStats() {
    await this.ensureDeliveryColumns();
    const row = await this.productOrderRepository
      .createQueryBuilder('o')
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :pending)::int', 'pending')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :approved)::int', 'approved')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :shipped)::int', 'shipped')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :delivered)::int', 'delivered')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :rejected)::int', 'rejected')
      .where('(o.paymentMethod <> :razorpay OR o.paymentStatus = :paid)')
      .setParameters({
        pending: ProductOrderStatus.PENDING,
        approved: ProductOrderStatus.APPROVED,
        shipped: ProductOrderStatus.SHIPPED,
        delivered: ProductOrderStatus.DELIVERED,
        rejected: ProductOrderStatus.REJECTED,
        razorpay: 'razorpay',
        paid: 'paid',
      })
      .getRawOne();

    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      approved: Number(row?.approved ?? 0),
      shipped: Number(row?.shipped ?? 0),
      delivered: Number(row?.delivered ?? 0),
      rejected: Number(row?.rejected ?? 0),
    };
  }
}
