import { GiftService } from './gift.service';
import { GiftOrderStatus } from '../../database/entities/gift-order.entity';
import { RedemptionStatus, UserRole } from '../../common/enums';

describe('Gift order redemption matching', () => {
  it('uses the stored redemption ID when identical orders share a timestamp', async () => {
    const requestedAt = new Date('2026-10-02T10:00:00.000Z');
    const order = {
      id: 'first-order', userId: 'member', role: UserRole.ELECTRICIAN,
      giftProductId: 'gift', redemptionId: 'first-redemption', pointsUsed: 75,
      status: GiftOrderStatus.PENDING, orderedAt: requestedAt,
    };
    const giftOrders = { findOne: jest.fn().mockResolvedValue(order), update: jest.fn() };
    const products = { increment: jest.fn() };
    const redemptions = {
      findOne: jest.fn().mockResolvedValue({ id: 'first-redemption', status: RedemptionStatus.PENDING }),
      find: jest.fn(),
    };
    const redemptionService = { reject: jest.fn() };
    const service = new GiftService(products as any, giftOrders as any, redemptions as any, redemptionService as any);

    await service.updateOrderStatus(order.id, GiftOrderStatus.REJECTED);

    expect(redemptions.findOne).toHaveBeenCalledWith({ where: { id: 'first-redemption' } });
    expect(redemptions.find).not.toHaveBeenCalled();
    expect(redemptionService.reject).toHaveBeenCalledWith('first-redemption', expect.any(String), 'admin');
  });

  it('refunds the redemption nearest to the rejected order, not the newest identical gift', async () => {
    const orderedAt = new Date('2026-10-02T10:00:00.000Z');
    const order = {
      id: 'first-order', userId: 'member', role: UserRole.ELECTRICIAN,
      giftProductId: 'gift', pointsUsed: 75, status: GiftOrderStatus.PENDING, orderedAt,
    };
    const giftOrders = {
      findOne: jest.fn().mockResolvedValue(order),
      update: jest.fn(),
    };
    const products = { increment: jest.fn() };
    const redemptions = {
      find: jest.fn().mockResolvedValue([
        { id: 'second-redemption', status: RedemptionStatus.PENDING, requestedAt: new Date('2026-10-02T10:02:00.000Z') },
        { id: 'first-redemption', status: RedemptionStatus.PENDING, requestedAt: new Date('2026-10-02T10:00:01.000Z') },
      ]),
    };
    const redemptionService = { reject: jest.fn() };
    const service = new GiftService(products as any, giftOrders as any, redemptions as any, redemptionService as any);

    await service.updateOrderStatus(order.id, GiftOrderStatus.REJECTED);

    expect(redemptionService.reject).toHaveBeenCalledWith('first-redemption', expect.any(String), 'admin');
    expect(products.increment).toHaveBeenCalledWith({ id: 'gift' }, 'stock', 1);
  });

  it('does not delete a gift order before its points are refunded', async () => {
    const giftOrders = { findOne: jest.fn().mockResolvedValue({ status: GiftOrderStatus.PENDING }), remove: jest.fn() };
    const service = new GiftService({} as any, giftOrders as any, {} as any, {} as any);
    await expect(service.deleteOrder('order')).rejects.toThrow('Reject and refund');
    expect(giftOrders.remove).not.toHaveBeenCalled();
  });
});
