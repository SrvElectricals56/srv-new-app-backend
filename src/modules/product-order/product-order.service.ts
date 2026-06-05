import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductOrder, ProductOrderStatus } from '../../database/entities/product-order.entity';

@Injectable()
export class ProductOrderService {
  constructor(
    @InjectRepository(ProductOrder)
    private productOrderRepository: Repository<ProductOrder>,
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

    await this.productOrderRepository.update(id, updateData);
    return { message: 'Order status updated successfully' };
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
