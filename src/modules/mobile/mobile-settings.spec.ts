import { MobileService } from './mobile.service';

describe('Admin settings enforced by mobile API', () => {
  function setup(values: Record<string, string> = {}) {
    const service: any = Object.create(MobileService.prototype);
    service.settingsRepository = { find: jest.fn(async () => Object.entries(values).map(([key, value]) => ({ key, value }))) };
    service.dataSource = { transaction: jest.fn().mockResolvedValue({ accepted: true }) };
    return service;
  }

  it.each(['electrician', 'counterboy', 'user', 'dealer'])('rejects 10 when minimum is 21 for %s before writing', async role => {
    const service = setup({ minRedemptionPoints: '21' });
    await expect(service.requestBankTransfer('id', role, { amount: 10 })).rejects.toThrow('21');
    expect(service.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('allows the exact minimum and reads subsequent admin changes', async () => {
    const values = { minRedemptionPoints: '21' };
    const service = setup(values);
    await expect(service.requestBankTransfer('id', 'electrician', { amount: 21 })).resolves.toEqual({ accepted: true });
    values.minRedemptionPoints = '30';
    await expect(service.requestBankTransfer('id', 'electrician', { amount: 21 })).rejects.toThrow('30');
    expect(service.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('enforces the transfer minimum and feature switch', async () => {
    const values = { minTransferPoints: '21', transferPointsEnabled: 'true' };
    const service = setup(values);
    await expect(service.transferPoints('id', 'electrician', { receiverPhone: '9999999999', points: 10 })).rejects.toThrow('21');
    await expect(service.transferPoints('id', 'electrician', { receiverPhone: '9999999999', points: 21 })).resolves.toEqual({ accepted: true });
    values.transferPointsEnabled = 'false';
    await expect(service.transferPoints('id', 'electrician', { receiverPhone: '9999999999', points: 21 })).rejects.toThrow('disabled');
  });

  it('publishes numeric settings including explicit zero', async () => {
    const service = setup({ minRedemptionPoints: '21', maxPointsPerDay: '0', dealerCommissionRate: '8', refereeBonus: '0' });
    await expect(service.getAppSettings()).resolves.toMatchObject({ minRedemptionPoints: 21, maxPointsPerDay: 0, dealerBonusRate: 8, refereeBonus: 0 });
  });

  it('blocks disabled scans and gifts before transactions', async () => {
    const service = setup({ scanEnabled: 'false', giftsEnabled: 'false' });
    await expect(service.submitScan('id', 'electrician', 'qr', 'single')).rejects.toThrow('disabled');
    await expect(service.redeemReward('id', 'electrician', { schemeId: 'gift' })).rejects.toThrow('disabled');
    expect(service.dataSource.transaction).not.toHaveBeenCalled();
  });
});
