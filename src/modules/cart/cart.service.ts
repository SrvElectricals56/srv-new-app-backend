import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { ProductCartItem } from '../../database/entities/product-cart-item.entity';
import { ProductOrder, ProductOrderStatus } from '../../database/entities/product-order.entity';
import { Product } from '../../database/entities/product.entity';
import { Electrician } from '../../database/entities/electrician.entity';
import { Dealer } from '../../database/entities/dealer.entity';
import { AppUser } from '../../database/entities/app-user.entity';
import { CounterBoy } from '../../database/entities/counterboy.entity';
import { UserRole } from '../../common/enums';

@Injectable()
export class CartService implements OnModuleInit {
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

    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensurePaymentColumns();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private normalizeRole(role: string): UserRole {
    const map: Record<string, UserRole> = {
      dealer: UserRole.DEALER,
      electrician: UserRole.ELECTRICIAN,
      customer: UserRole.USER,
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

  private async ensurePaymentColumns() {
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paymentMethod" varchar NOT NULL DEFAULT 'cod'
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paymentStatus" varchar NOT NULL DEFAULT 'pending'
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "razorpayOrderId" varchar
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "razorpayPaymentId" varchar
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paidAt" timestamptz
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "paymentFailureReason" text
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "estimatedDeliveryAt" timestamptz
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "dispatchedAt" timestamptz
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "rejectedAt" timestamptz
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "refundStatus" varchar
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "refundMessage" text
    `);
    await this.orderRepo.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "deliveryNotes" text
    `);
    await this.orderRepo.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_orders_razorpay_order"
      ON "product_orders" ("razorpayOrderId")
      WHERE "razorpayOrderId" IS NOT NULL
    `);
    await this.orderRepo.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_orders_razorpay_payment"
      ON "product_orders" ("razorpayPaymentId")
      WHERE "razorpayPaymentId" IS NOT NULL
    `);
  }

  private estimateDeliveryDate(from = new Date()) {
    const estimated = new Date(from);
    estimated.setDate(estimated.getDate() + 5);
    return estimated;
  }

  private getRazorpayCredentials() {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID')?.trim();
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET')?.trim();
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException('Online payment is not configured yet. Please contact support.');
    }
    return { keyId, keySecret };
  }

  private signaturesMatch(expected: string, received: string) {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(received, 'utf8');
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  /**
   * Existing catalog records use stock=0 when inventory tracking was never
   * configured. Treat those records as untracked; positive stock remains a
   * real limit and is decremented when an order is confirmed.
   */
  private hasTrackedStock(product: Product) {
    return Number(product.stock ?? 0) > 0;
  }

  private ensureAvailableStock(product: Product, quantity: number) {
    if (this.hasTrackedStock(product) && Number(product.stock) < quantity) {
      throw new BadRequestException('Product has insufficient stock');
    }
  }

  private async finalizeRazorpayOrder(orderId: string, payment: any) {
    return this.orderRepo.manager.transaction(async (manager) => {
      const orderRepository = manager.getRepository(ProductOrder);
      const productRepository = manager.getRepository(Product);
      const order = await orderRepository.findOne({
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Payment order not found');
      if (order.paymentStatus === 'paid') return order;

      const expectedAmount = Math.round(Number(order.price) * order.quantity * 100);
      if (
        payment.order_id !== order.razorpayOrderId ||
        Number(payment.amount) !== expectedAmount ||
        payment.currency !== 'INR' ||
        payment.status !== 'captured'
      ) {
        throw new BadRequestException('Payment details do not match this order');
      }

      const product = await productRepository.findOne({
        where: { id: order.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        throw new BadRequestException('Payment received, but the product is unavailable. Please contact support.');
      }
      this.ensureAvailableStock(product, order.quantity);

      if (this.hasTrackedStock(product)) {
        product.stock = Number(product.stock) - order.quantity;
        await productRepository.save(product);
      }

      order.paymentStatus = 'paid';
      order.razorpayPaymentId = payment.id;
      order.paidAt = new Date();
      order.paymentFailureReason = null;
      order.estimatedDeliveryAt = order.estimatedDeliveryAt ?? this.estimateDeliveryDate(order.paidAt);
      order.refundStatus = null;
      order.refundMessage = null;
      order.deliveryNotes = order.deliveryNotes ?? 'Payment done. Order is waiting for dispatch.';
      return orderRepository.save(order);
    });
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
    this.ensureAvailableStock(product, quantity);

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
        paymentMethod: 'cod',
        paymentStatus: 'pending',
      }),
    );

    if (this.hasTrackedStock(product)) {
      await this.productRepo.decrement({ id: product.id }, 'stock', quantity);
    }

    return { message: 'Order submitted successfully', order };
  }

  async createRazorpayOrder(
    userId: string,
    role: string,
    body: { productId: string; quantity?: number; shippingAddress?: string },
  ) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));
    if (!body.productId) throw new BadRequestException('productId is required');
    if (!body.shippingAddress?.trim()) throw new BadRequestException('Shipping address is required');

    const normalizedRole = this.normalizeRole(role);
    const [user, product] = await Promise.all([
      this.getUserByRole(userId, normalizedRole),
      this.productRepo.findOne({ where: { id: body.productId, isActive: true } as any }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!product || product.category === 'gift') throw new NotFoundException('Product not found');
    this.ensureAvailableStock(product, quantity);

    const unitPrice = Number(product.price ?? 0);
    const amount = Math.round(unitPrice * quantity * 100);
    if (!Number.isFinite(amount) || amount < 100) {
      throw new BadRequestException('Online payment amount must be at least INR 1');
    }

    const { keyId, keySecret } = this.getRazorpayCredentials();
    let razorpayOrder: { id: string; amount: number; currency: string };
    try {
      const response = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount,
          currency: 'INR',
          receipt: `srv_${Date.now()}_${userId.slice(0, 8)}`,
          notes: {
            productId: product.id,
            userId,
            userRole: normalizedRole,
          },
        },
        { auth: { username: keyId, password: keySecret }, timeout: 15000 },
      );
      razorpayOrder = response.data;
    } catch (error: any) {
      const message = error?.response?.data?.error?.description || error?.message;
      throw new ServiceUnavailableException(message || 'Unable to start online payment');
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
        quantity,
        price: unitPrice,
        status: ProductOrderStatus.PENDING,
        shippingAddress: body.shippingAddress.trim(),
        paymentMethod: 'razorpay',
        paymentStatus: 'created',
        razorpayOrderId: razorpayOrder.id,
      }),
    );

    return {
      keyId,
      productOrderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount: Number(razorpayOrder.amount),
      currency: razorpayOrder.currency || 'INR',
      businessName: 'SRV Electricals',
      description: product.name,
      prefill: {
        name: (user as any).name ?? '',
        contact: (user as any).phone ?? '',
        email: (user as any).email ?? '',
      },
    };
  }

  async verifyRazorpayPayment(
    userId: string,
    role: string,
    body: {
      productOrderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) {
    const requiredValues = [body.productOrderId, body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature];
    if (requiredValues.some((value) => !value?.trim())) {
      throw new BadRequestException('Complete Razorpay payment details are required');
    }

    const normalizedRole = this.normalizeRole(role);
    const existingOrder = await this.orderRepo.findOne({
      where: {
        id: body.productOrderId,
        userId,
        userRole: normalizedRole,
        razorpayOrderId: body.razorpayOrderId,
      },
    });
    if (!existingOrder) throw new NotFoundException('Payment order not found');
    if (existingOrder.paymentStatus === 'paid') {
      return { message: 'Payment already verified', order: existingOrder };
    }

    const { keyId, keySecret } = this.getRazorpayCredentials();
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${body.razorpayOrderId}|${body.razorpayPaymentId}`)
      .digest('hex');
    if (!this.signaturesMatch(expectedSignature, body.razorpaySignature)) {
      await this.orderRepo.update(existingOrder.id, {
        paymentStatus: 'failed',
        paymentFailureReason: 'Invalid payment signature',
      });
      throw new BadRequestException('Payment verification failed');
    }

    let payment: any;
    try {
      const response = await axios.get(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(body.razorpayPaymentId)}`,
        { auth: { username: keyId, password: keySecret }, timeout: 15000 },
      );
      payment = response.data;

      if (payment.status === 'authorized') {
        const captureResponse = await axios.post(
          `https://api.razorpay.com/v1/payments/${encodeURIComponent(body.razorpayPaymentId)}/capture`,
          { amount: Number(payment.amount), currency: payment.currency || 'INR' },
          { auth: { username: keyId, password: keySecret }, timeout: 15000 },
        );
        payment = captureResponse.data;
      }
    } catch (error: any) {
      const message = error?.response?.data?.error?.description || error?.message;
      throw new ServiceUnavailableException(message || 'Unable to confirm payment with Razorpay');
    }

    const expectedAmount = Math.round(Number(existingOrder.price) * existingOrder.quantity * 100);
    if (
      payment.order_id !== body.razorpayOrderId ||
      Number(payment.amount) !== expectedAmount ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    ) {
      await this.orderRepo.update(existingOrder.id, {
        paymentStatus: 'failed',
        paymentFailureReason: 'Razorpay payment details did not match the order',
      });
      throw new BadRequestException('Payment details do not match this order');
    }

    const paidOrder = await this.finalizeRazorpayOrder(existingOrder.id, payment);

    return { message: 'Payment verified and order placed successfully', order: paidOrder };
  }

  async recordRazorpayFailure(
    userId: string,
    role: string,
    body: { productOrderId: string; reason?: string },
  ) {
    if (!body.productOrderId) throw new BadRequestException('productOrderId is required');
    const normalizedRole = this.normalizeRole(role);
    const order = await this.orderRepo.findOne({
      where: { id: body.productOrderId, userId, userRole: normalizedRole, paymentMethod: 'razorpay' },
    });
    if (!order) throw new NotFoundException('Payment order not found');
    if (order.paymentStatus !== 'paid') {
      order.paymentStatus = 'failed';
      order.paymentFailureReason = body.reason?.slice(0, 500) || 'Payment cancelled by user';
      await this.orderRepo.save(order);
    }
    return { message: 'Payment failure recorded' };
  }

  async handleRazorpayWebhook(signature: string, rawBody: Buffer | undefined, payload: any) {
    const webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET')?.trim();
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Razorpay webhook is not configured');
    }
    if (!signature || !rawBody?.length) {
      throw new BadRequestException('Invalid Razorpay webhook request');
    }

    const expectedSignature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!this.signaturesMatch(expectedSignature, signature)) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }

    if (payload?.event !== 'payment.captured') {
      return { received: true, processed: false };
    }

    const payment = payload?.payload?.payment?.entity;
    if (!payment?.id || !payment?.order_id) {
      throw new BadRequestException('Razorpay payment data is missing');
    }

    const order = await this.orderRepo.findOne({ where: { razorpayOrderId: payment.order_id } });
    if (!order) {
      return { received: true, processed: false };
    }

    await this.finalizeRazorpayOrder(order.id, payment);
    return { received: true, processed: true };
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

    const productIds = [...new Set(cartItems.map((item) => item.productId))];
    const products = await this.productRepo.find({
      where: { id: In(productIds), isActive: true } as any,
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const orderDrafts: ProductOrder[] = [];

    for (const item of cartItems) {
      const product = productById.get(item.productId);
      if (!product || product.category === 'gift') continue;
      this.ensureAvailableStock(product, item.quantity);

      orderDrafts.push(
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
          paymentMethod: 'cod',
          paymentStatus: 'pending',
        }),
      );
    }

    const orders = orderDrafts.length ? await this.orderRepo.save(orderDrafts) : [];

    for (const order of orders) {
      const product = productById.get(order.productId);
      if (product && this.hasTrackedStock(product)) {
        await this.productRepo.decrement({ id: order.productId }, 'stock', order.quantity);
      }
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

    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .where('order.userId = :userId', { userId })
      .andWhere('order.userRole = :userRole', { userRole: normalizedRole })
      .andWhere('(order.paymentMethod <> :razorpay OR order.paymentStatus = :paid)', {
        razorpay: 'razorpay',
        paid: 'paid',
      })
      .orderBy('order.orderedAt', 'DESC')
      .getMany();

    return { orders, total: orders.length };
  }
}
