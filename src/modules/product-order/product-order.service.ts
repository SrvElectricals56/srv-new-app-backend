import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProductOrder, ProductOrderStatus } from '../../database/entities/product-order.entity';
import { PointsConfig } from '../../database/entities/points-config.entity';
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
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(CounterBoy)
    private counterBoyRepository: Repository<CounterBoy>,
    private dataSource: DataSource,
  ) {}

  async findAll(page = 1, limit = 20, status?: string, role?: string, search?: string) {
    const qb = this.productOrderRepository.createQueryBuilder('o')
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

    const mapped = data.map((o) => ({
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
      rejectionReason: o.rejectionReason,
      orderedAt: o.orderedAt,
      updatedAt: o.updatedAt,
    }));

    return { data: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Product order not found');
    return order;
  }

  async updateStatus(id: string, status: string, extra?: { rejectionReason?: string; trackingNumber?: string }) {
    const order = await this.productOrderRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Product order not found');

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
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updateData: Partial<ProductOrder> = { status: status as ProductOrderStatus };
    if (extra?.rejectionReason && (status === ProductOrderStatus.REJECTED)) {
      updateData.rejectionReason = extra.rejectionReason;
    }
    if (extra?.trackingNumber) {
      updateData.trackingNumber = extra.trackingNumber;
    }

    // ── Credit points to user/counterboy wallet on delivery ──
    if (
      status === ProductOrderStatus.DELIVERED &&
      (order.userRole === UserRole.USER || order.userRole === UserRole.COUNTERBOY)
    ) {
      const pointsConfig = await this.pointsConfigRepository.findOne({
        where: { productId: order.productId, isActive: true },
      });
      const pointsPerUnit = pointsConfig?.basePoints ?? 0;
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
    return { message: 'Order status updated successfully' };
  }

  private calculateTier(points: number): string {
    if (points >= 10000) return 'Diamond';
    if (points >= 5001) return 'Platinum';
    if (points >= 1001) return 'Gold';
    return 'Silver';
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    await this.productOrderRepository.remove(order);
    return { message: 'Product order deleted successfully' };
  }

  async getStats() {
    const [
      { total },
      pending,
      approved,
      shipped,
      delivered,
      rejected,
    ] = await Promise.all([
      this.productOrderRepository.createQueryBuilder('o').select('COUNT(*)', 'total').getRawOne(),
      this.productOrderRepository.count({ where: { status: ProductOrderStatus.PENDING } }),
      this.productOrderRepository.count({ where: { status: ProductOrderStatus.APPROVED } }),
      this.productOrderRepository.count({ where: { status: ProductOrderStatus.SHIPPED } }),
      this.productOrderRepository.count({ where: { status: ProductOrderStatus.DELIVERED } }),
      this.productOrderRepository.count({ where: { status: ProductOrderStatus.REJECTED } }),
    ]);

    return {
      total: parseInt(total ?? '0'),
      pending,
      approved,
      shipped,
      delivered,
      rejected,
    };
  }
}
