import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder, ProductOrderStatus } from '../../database/entities/product-order.entity';
import { Product } from '../../database/entities/product.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { UserRole } from '../../common/enums';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(ProductCartItem)
    private cartRepo: Repository<ProductCartItem>,

    @InjectRepository(ProductOrder)
    private orderRepo: Repository<ProductOrder>,

    @InjectRepository(Product)
    private productRepo: Repository<Product>,

    @InjectRepository(Electrician)
    private electricianRepo: Repository<Electrician>,

    @InjectRepository(Dealer)
    private dealerRepo: Repository<Dealer>,

    @InjectRepository(AppUser)
    private appUserRepo: Repository<AppUser>,

    @InjectRepository(CounterBoy)
    private counterboyRepo: Repository<CounterBoy>,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private normalizeRole(role: string): UserRole {
    const map: Record<string, UserRole> = {
      dealer: UserRole.DEALER,
      electrician: UserRole.ELECTRICIAN,
      user: UserRole.USER,
      counterboy: UserRole.COUNTERBOY,
    };
    return map[role?.toLowerCase()] ?? UserRole.USER;
  }

  private async getUserByRole(userId: string, role: UserRole) {
    switch (role) {
      case UserRole.ELECTRICIAN:
        return this.electricianRepo.findOne({ where: { id: userId } as any });
      case UserRole.DEALER:
        return this.dealerRepo.findOne({ where: { id: userId } as any });
      case UserRole.COUNTERBOY:
        return this.counterboyRepo.findOne({ where: { id: userId } as any });
      default:
        return this.appUserRepo.findOne({ where: { id: userId } as any });
    }
  }

  private getUserCode(user: any, role: UserRole): string {
    if (role === UserRole.ELECTRICIAN) return user?.electricianCode ?? '';
    if (role === UserRole.DEALER) return user?.dealerCode ?? '';
    if (role === UserRole.COUNTERBOY) return user?.counterboyCode ?? '';
    return user?.userCode ?? '';
  }

  // ── Cart ───────────────────────────────────────────────────────────────────

  /** Add a product to cart or increment its quantity if already present */
  async addToCart(
    userId: string,
    role: string,
    body: { productId: string; quantity?: number },
  ) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    if (!body.productId) throw new BadRequestException('productId is required');

    const normalizedRole = this.normalizeRole(role);

    const [user, product] = await Promise.all([
      this.getUserByRole(userId, normalizedRole),
      this.productRepo.findOne({ where: { id: body.productId, isActive: true } as any }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!product || product.category === 'gift') throw new NotFoundException('Product not found');

    const existing = await this.cartRepo.findOne({
      where: { userId, userRole: normalizedRole, productId: product.id },
    });

    const itemData = {
      userId,
      userRole: normalizedRole,
      userName: (user as any).name ?? '',
      userPhone: (user as any).phone ?? '',
      userCode: this.getUserCode(user, normalizedRole),
      productId: product.id,
      productName: product.name,
      productImage: product.image ?? '',
      price: Number(product.price ?? 0),
    };

    const saved = existing
      ? await this.cartRepo.save({
          ...existing,
          ...itemData,
          quantity: existing.quantity + quantity,
        })
      : await this.cartRepo.save(this.cartRepo.create({ ...itemData, quantity }));

    return { message: 'Product added to cart', item: saved };
  }

  /** Get all cart items for a user */
  async getCart(userId: string, role: string) {
    const normalizedRole = this.normalizeRole(role);

    const items = await this.cartRepo.find({
      where: { userId, userRole: normalizedRole },
      order: { addedAt: 'DESC' },
    });

    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalPrice = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    return { items, totalItems, totalPrice };
  }

  /** Update quantity of a cart item */
  async updateCartItem(
    userId: string,
    role: string,
    itemId: string,
    body: { quantity: number },
  ) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    const normalizedRole = this.normalizeRole(role);

    const item = await this.cartRepo.findOne({
      where: { id: itemId, userId, userRole: normalizedRole },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    await this.cartRepo.update(itemId, { quantity });
    return { message: 'Cart item updated', item: { ...item, quantity } };
  }

  /** Remove a single item from cart */
  async removeFromCart(userId: string, role: string, itemId: string) {
    const normalizedRole = this.normalizeRole(role);

    const item = await this.cartRepo.findOne({
      where: { id: itemId, userId, userRole: normalizedRole },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    await this.cartRepo.delete(itemId);
    return { message: 'Item removed from cart' };
  }

  /** Clear all cart items for a user */
  async clearCart(userId: string, role: string) {
    const normalizedRole = this.normalizeRole(role);
    await this.cartRepo.delete({ userId, userRole: normalizedRole });
    return { message: 'Cart cleared' };
  }

  // ── Product Orders ─────────────────────────────────────────────────────────

  /** Buy now — place a product order directly (no cart involved) */
  async createOrder(
    userId: string,
    role: string,
    body: { productId: string; quantity?: number; shippingAddress?: string },
  ) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    if (!body.productId) throw new BadRequestException('productId is required');

    const normalizedRole = this.normalizeRole(role);

    const [user, product] = await Promise.all([
      this.getUserByRole(userId, normalizedRole),
      this.productRepo.findOne({ where: { id: body.productId, isActive: true } as any }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!product || product.category === 'gift') throw new NotFoundException('Product not found');
    if (Number(product.stock ?? 0) <= 0) throw new BadRequestException('Product is out of stock');

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        userId,
        userRole: normalizedRole,
        userName: (user as any).name ?? '',
        userPhone: (user as any).phone ?? '',
        userCode: this.getUserCode(user, normalizedRole),
        productId: product.id,
        productName: product.name,
        productImage: product.image ?? '',
        quantity,
        price: Number(product.price ?? 0),
        status: ProductOrderStatus.PENDING,
        shippingAddress: body.shippingAddress ?? (user as any).address ?? '',
      }),
    );

    await this.productRepo.decrement({ id: product.id }, 'stock', quantity);

    return { message: 'Order submitted successfully', order };
  }

  /** Place order from current cart (checkout all cart items as separate orders) */
  async checkoutCart(
    userId: string,
    role: string,
    body: { shippingAddress?: string },
  ) {
    const normalizedRole = this.normalizeRole(role);

    const cartItems = await this.cartRepo.find({
      where: { userId, userRole: normalizedRole },
    });
    if (!cartItems.length) throw new BadRequestException('Your cart is empty');

    const user = await this.getUserByRole(userId, normalizedRole);
    if (!user) throw new NotFoundException('User not found');

    const orders: ProductOrder[] = [];

    for (const item of cartItems) {
      const product = await this.productRepo.findOne({
        where: { id: item.productId, isActive: true } as any,
      });
      if (!product || product.category === 'gift') continue;
      if (Number(product.stock ?? 0) < item.quantity) {
        throw new BadRequestException(`Product "${product.name}" has insufficient stock`);
      }

      const order = await this.orderRepo.save(
        this.orderRepo.create({
          userId,
          userRole: normalizedRole,
          userName: (user as any).name ?? '',
          userPhone: (user as any).phone ?? '',
          userCode: this.getUserCode(user, normalizedRole),
          productId: product.id,
          productName: product.name,
          productImage: product.image ?? '',
          quantity: item.quantity,
          price: Number(product.price ?? 0),
          status: ProductOrderStatus.PENDING,
          shippingAddress: body.shippingAddress ?? (user as any).address ?? '',
        }),
      );

      await this.productRepo.decrement({ id: product.id }, 'stock', item.quantity);
      orders.push(order);
    }

    // Clear cart after successful checkout
    await this.cartRepo.delete({ userId, userRole: normalizedRole });

    return {
      message: 'Checkout successful',
      ordersPlaced: orders.length,
      orders,
    };
  }

  /** Get product order history for a user */
  async getMyOrders(userId: string, role: string) {
    const normalizedRole = this.normalizeRole(role);

    const orders = await this.orderRepo.find({
      where: { userId, userRole: normalizedRole },
      order: { orderedAt: 'DESC' },
    });

    return { orders, total: orders.length };
  }
}
