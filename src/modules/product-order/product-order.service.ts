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

const ADMIN_PRODUCT_ORDER_STATUSES = [
  ProductOrderStatus.PENDING,
  ProductOrderStatus.OUT_FOR_DELIVERY,
  ProductOrderStatus.SHIPPED,
  ProductOrderStatus.DELIVERED,
  ProductOrderStatus.REJECTED,
  ProductOrderStatus.REFUNDED,
];

const PRODUCT_ORDER_STATUS_LABELS: Record<ProductOrderStatus, string> = {
  [ProductOrderStatus.PENDING]: 'Pending',
  [ProductOrderStatus.APPROVED]: 'Approved',
  [ProductOrderStatus.OUT_FOR_DELIVERY]: 'Shipped',
  [ProductOrderStatus.SHIPPED]: 'Shipped',
  [ProductOrderStatus.DELIVERED]: 'Delivered',
  [ProductOrderStatus.REJECTED]: 'Rejected',
  [ProductOrderStatus.CANCELLED]: 'Cancelled',
  [ProductOrderStatus.RETURNED]: 'Returned',
  [ProductOrderStatus.REFUNDED]: 'Refunded',
};

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

  private estimateDeliveryDate(from = new Date()) {
    const estimated = new Date(from);
    estimated.setDate(estimated.getDate() + 5);
    return estimated;
  }

  private getOrderCode(id: string) {
    let hash = 0;
    for (const character of String(id)) hash = ((hash * 31) + character.charCodeAt(0)) | 0;
    return `SRV${String(Math.abs(hash) % 100000).padStart(5, '0')}`;
  }

  private normalizeStatus(status: string) {
    return String(status ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }

  private async ensureAdminStatusEnum() {
    await this.productOrderRepository.query(`
      ALTER TYPE "public"."product_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'out_for_delivery'
    `);
  }

  getAvailableStatuses() {
    return {
      data: ADMIN_PRODUCT_ORDER_STATUSES.map((status) => ({
        value: status,
        label: PRODUCT_ORDER_STATUS_LABELS[status],
      })),
    };
  }

  private mapOrder(o: ProductOrder) {
    return {
      id: o.id,
      orderCode: this.getOrderCode(o.id),
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
      statusLabel: PRODUCT_ORDER_STATUS_LABELS[o.status],
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
      cancelReason: o.cancelReason,
      returnReason: o.returnReason,
      refundReason: o.refundReason,
      customerActionAt: o.customerActionAt,
      orderedAt: o.orderedAt,
      updatedAt: o.updatedAt,
    };
  }

  async findAll(page = 1, limit = 20, status?: string, role?: string, search?: string) {
    const qb = this.productOrderRepository.createQueryBuilder('o')
      .where('(o.paymentMethod <> :razorpay OR o.paymentStatus = :paid)', { razorpay: 'razorpay', paid: 'paid' })
      .orderBy('o.orderedAt', 'DESC');

    if (status && status !== 'all') {
      qb.andWhere('o.status = :status', { status: this.normalizeStatus(status) });
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
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order || (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid')) {
      throw new NotFoundException('Product order not found');
    }
    return this.mapOrder(order);
  }

  async updateStatus(id: string, status: string, extra?: { rejectionReason?: string; trackingNumber?: string; courierName?: string; refundMessage?: string }) {
    const normalizedStatus = this.normalizeStatus(status);
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order || (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid')) {
      throw new NotFoundException('Product order not found');
    }

    if (!ADMIN_PRODUCT_ORDER_STATUSES.includes(normalizedStatus as ProductOrderStatus)) {
      throw new BadRequestException(
        `Invalid status: ${status}. Valid: ${ADMIN_PRODUCT_ORDER_STATUSES.join(', ')}`,
      );
    }
    await this.ensureAdminStatusEnum();

    const transitions: Record<string, string[]> = {
      [ProductOrderStatus.PENDING]: [
        ProductOrderStatus.OUT_FOR_DELIVERY,
        ProductOrderStatus.REJECTED,
        ProductOrderStatus.SHIPPED,
        ProductOrderStatus.DELIVERED,
        ProductOrderStatus.REFUNDED,
      ],
      [ProductOrderStatus.APPROVED]: [
        ProductOrderStatus.PENDING,
        ProductOrderStatus.OUT_FOR_DELIVERY,
        ProductOrderStatus.SHIPPED,
        ProductOrderStatus.REJECTED,
        ProductOrderStatus.DELIVERED,
        ProductOrderStatus.REFUNDED,
      ],
      [ProductOrderStatus.OUT_FOR_DELIVERY]: [
        ProductOrderStatus.SHIPPED,
        ProductOrderStatus.DELIVERED,
        ProductOrderStatus.REJECTED,
        ProductOrderStatus.REFUNDED,
      ],
      [ProductOrderStatus.SHIPPED]: [
        ProductOrderStatus.OUT_FOR_DELIVERY,
        ProductOrderStatus.DELIVERED,
        ProductOrderStatus.REJECTED,
        ProductOrderStatus.REFUNDED,
      ],
      [ProductOrderStatus.DELIVERED]: [ProductOrderStatus.REJECTED, ProductOrderStatus.REFUNDED],
      [ProductOrderStatus.REJECTED]: [ProductOrderStatus.PENDING, ProductOrderStatus.OUT_FOR_DELIVERY],
      [ProductOrderStatus.CANCELLED]: [ProductOrderStatus.PENDING, ProductOrderStatus.OUT_FOR_DELIVERY, ProductOrderStatus.REFUNDED],
      [ProductOrderStatus.RETURNED]: [ProductOrderStatus.PENDING, ProductOrderStatus.OUT_FOR_DELIVERY, ProductOrderStatus.REFUNDED],
      [ProductOrderStatus.REFUNDED]: [],
    };

    const allowed = transitions[order.status] ?? [];
    if (normalizedStatus !== order.status && !allowed.includes(normalizedStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${normalizedStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updateData: Partial<ProductOrder> = { status: normalizedStatus as ProductOrderStatus };
    if (!order.estimatedDeliveryAt && normalizedStatus !== ProductOrderStatus.REJECTED) {
      updateData.estimatedDeliveryAt = this.estimateDeliveryDate(order.paidAt ?? order.orderedAt ?? new Date());
    }
    if (extra?.rejectionReason && (normalizedStatus === ProductOrderStatus.REJECTED)) {
      updateData.rejectionReason = extra.rejectionReason;
    }
    if (extra?.trackingNumber) {
      updateData.trackingNumber = extra.trackingNumber;
    }
    if (extra?.courierName) {
      updateData.courierName = extra.courierName;
    }
    if (normalizedStatus === ProductOrderStatus.PENDING) {
      updateData.deliveryNotes = 'Payment done. Order is waiting for dispatch.';
    }
    if (normalizedStatus === ProductOrderStatus.APPROVED) {
      updateData.deliveryNotes = 'Order confirmed and ready for packing.';
    }
    if (normalizedStatus === ProductOrderStatus.OUT_FOR_DELIVERY) {
      updateData.dispatchedAt = order.dispatchedAt ?? new Date();
      updateData.deliveryNotes = 'Order is out for delivery.';
    }
    if (normalizedStatus === ProductOrderStatus.SHIPPED) {
      updateData.dispatchedAt = order.dispatchedAt ?? new Date();
      updateData.deliveryNotes = extra?.courierName
        ? `Order dispatched through ${extra.courierName}.`
        : 'Order dispatched. Delivery partner update is awaited.';
    }
    if (normalizedStatus === ProductOrderStatus.DELIVERED) {
      updateData.deliveredAt = order.deliveredAt ?? new Date();
      updateData.deliveryNotes = 'Order delivered successfully.';
    }
    if (normalizedStatus === ProductOrderStatus.REJECTED) {
      const isPaid = order.paymentStatus === 'paid';
      updateData.rejectedAt = new Date();
      updateData.refundStatus = isPaid ? 'pending' : null;
      updateData.refundMessage = extra?.refundMessage || (isPaid
        ? 'Order rejected. Your refund will be credited within 4 to 5 working days.'
        : 'Order rejected before payment confirmation.');
      updateData.deliveryNotes = isPaid
        ? 'Rejected by admin. Refund will be credited within 4 to 5 working days.'
        : 'Rejected by admin.';
      updateData.rejectionReason = extra?.rejectionReason || order.rejectionReason || 'Rejected by admin';
    }
    if (status === ProductOrderStatus.CANCELLED) {
      const isPaid = order.paymentStatus === 'paid';
      updateData.refundStatus = isPaid ? 'pending' : null;
      updateData.refundMessage = extra?.refundMessage || (isPaid
        ? 'Order cancelled. Your refund will be credited within 4 to 5 working days.'
        : 'Order cancelled successfully.');
      updateData.deliveryNotes = 'Order cancelled.';
    }
    if (status === ProductOrderStatus.RETURNED) {
      updateData.refundStatus = order.paymentStatus === 'paid' ? 'pending' : order.refundStatus;
      updateData.refundMessage = extra?.refundMessage || 'Return accepted. Your refund will be credited within 4 to 5 working days after pickup verification.';
      updateData.deliveryNotes = 'Return accepted by admin.';
    }
    if (status === ProductOrderStatus.REFUNDED) {
      updateData.paymentStatus = order.paymentStatus === 'paid' ? 'refunded' : order.paymentStatus;
      updateData.refundStatus = 'completed';
      updateData.refundMessage = extra?.refundMessage || 'Refund completed.';
      updateData.deliveryNotes = 'Refund completed.';
    }

    // ── Credit points to user/counterboy wallet on delivery ──
    if (
      normalizedStatus === ProductOrderStatus.DELIVERED &&
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
      message: normalizedStatus === ProductOrderStatus.REJECTED
        ? 'Order rejected. Refund message sent to customer.'
        : 'Order status updated successfully',
      status: normalizedStatus,
      statusLabel: PRODUCT_ORDER_STATUS_LABELS[normalizedStatus as ProductOrderStatus],
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
    const row = await this.productOrderRepository
      .createQueryBuilder('o')
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :pending)::int', 'pending')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :approved)::int', 'approved')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :shipped)::int', 'shipped')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :outForDelivery)::int', 'outForDelivery')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :delivered)::int', 'delivered')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :rejected)::int', 'rejected')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :cancelled)::int', 'cancelled')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :returned)::int', 'returned')
      .addSelect('COUNT(*) FILTER (WHERE o.status = :refunded)::int', 'refunded')
      .where('(o.paymentMethod <> :razorpay OR o.paymentStatus = :paid)')
      .setParameters({
        pending: ProductOrderStatus.PENDING,
        approved: ProductOrderStatus.APPROVED,
        outForDelivery: ProductOrderStatus.OUT_FOR_DELIVERY,
        shipped: ProductOrderStatus.SHIPPED,
        delivered: ProductOrderStatus.DELIVERED,
        rejected: ProductOrderStatus.REJECTED,
        cancelled: ProductOrderStatus.CANCELLED,
        returned: ProductOrderStatus.RETURNED,
        refunded: ProductOrderStatus.REFUNDED,
        razorpay: 'razorpay',
        paid: 'paid',
      })
      .getRawOne();

    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      approved: Number(row?.approved ?? 0),
      outForDelivery: Number(row?.outForDelivery ?? 0),
      shipped: Number(row?.shipped ?? 0),
      delivered: Number(row?.delivered ?? 0),
      rejected: Number(row?.rejected ?? 0),
      cancelled: Number(row?.cancelled ?? 0),
      returned: Number(row?.returned ?? 0),
      refunded: Number(row?.refunded ?? 0),
    };
  }
}
