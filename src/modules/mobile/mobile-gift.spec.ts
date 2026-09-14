import { MobileService } from './mobile.service';
import { Product } from '../../database/entities/product.entity';
import { GiftOrder } from '../../database/entities/gift-order.entity';
import { Redemption } from '../../database/entities/redemption.entity';
import { Wallet } from '../../database/entities/wallet.entity';

describe('Gift redemption compatibility with installed apps', () => {
  function setup() {
    const service: any = Object.create(MobileService.prototype);
    const product = { id: 'gift', name: 'Gift', category: 'gift', subCategory: 'electrician', points: 100, stock: 1 };
    const user = { id: 'owner', name: 'Test', walletBalance: 500, totalPoints: 650, address: '  House 42, Main Road, Ludhiana  ' };
    const repos = new Map<any, any>();
    for (const entity of [Product, GiftOrder, Redemption, Wallet]) repos.set(entity, {
      create: jest.fn(value => value),
      save: jest.fn(async value => ({ ...value, id: entity.name })),
      update: jest.fn(), decrement: jest.fn(), findOne: jest.fn(async () => product),
    });
    const manager = { getRepository: (entity: any) => repos.get(entity) };
    service.dataSource = { transaction: jest.fn(callback => callback(manager)) };
    service.getUserByRoleForUpdate = jest.fn(async () => user);
    service.updateUserByRole = jest.fn();
    service.tierService = { calculateElectricianTier: jest.fn(() => 'silver') };
    return { service, product, user, repos };
  }

  it('accepts the old app payload and saves the profile address with one debit and order', async () => {
    const { service, repos } = setup();
    const result = await service.redeemReward('owner', 'electrician', { schemeId: 'gift' });
    expect(result.walletBalance).toBe(400);
    expect(repos.get(GiftOrder).save).toHaveBeenCalledTimes(1);
    expect(repos.get(GiftOrder).save).toHaveBeenCalledWith(expect.objectContaining({ shippingAddress: 'House 42, Main Road, Ludhiana', pointsUsed: 100 }));
    expect(repos.get(Wallet).save).toHaveBeenCalledTimes(1);
    expect(repos.get(Wallet).save).toHaveBeenCalledWith(expect.objectContaining({ balanceBefore: 500, balanceAfter: 400, amount: 100 }));
    expect(service.updateUserByRole).toHaveBeenCalledWith('owner', 'electrician', expect.objectContaining({ walletBalance: 400, totalPoints: 550 }), expect.anything());
    expect(repos.get(Product).decrement).toHaveBeenCalledWith({ id: 'gift' }, 'stock', 1);
    expect(repos.get(Product).findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });

  it('uses the explicit checkout address instead of the profile address', async () => {
    const { service, repos } = setup();
    await service.redeemReward('owner', 'electrician', { schemeId: 'gift', shippingAddress: '  House 99, New Delivery Road  ' });
    expect(repos.get(GiftOrder).save).toHaveBeenCalledWith(expect.objectContaining({ shippingAddress: 'House 99, New Delivery Road' }));
  });

  it.each(['', 'short', null])('rejects a legacy request with an incomplete profile address (%s) without debiting', async address => {
    const { service, user, repos } = setup();
    user.address = address;
    await expect(service.redeemReward('owner', 'electrician', { schemeId: 'gift' })).rejects.toThrow('Profile');
    expect(service.updateUserByRole).not.toHaveBeenCalled();
    expect(repos.get(Wallet).save).not.toHaveBeenCalled();
    expect(repos.get(GiftOrder).save).not.toHaveBeenCalled();
  });

  it.each(['', 'short', null, 123, {}])('rejects an explicitly invalid address without silently substituting the profile (%s)', async shippingAddress => {
    const { service } = setup();
    await expect(service.redeemReward('owner', 'electrician', { schemeId: 'gift', shippingAddress })).rejects.toThrow('complete delivery address');
    expect(service.dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each(['stock', 'balance', 'role'])('preserves the %s restriction for old apps', async restriction => {
    const { service, product, user, repos } = setup();
    if (restriction === 'stock') product.stock = 0;
    if (restriction === 'balance') user.walletBalance = 99;
    if (restriction === 'role') product.subCategory = 'dealer';
    await expect(service.redeemReward('owner', 'electrician', { schemeId: 'gift' })).rejects.toThrow();
    expect(service.updateUserByRole).not.toHaveBeenCalled();
    expect(repos.get(GiftOrder).save).not.toHaveBeenCalled();
  });
});
