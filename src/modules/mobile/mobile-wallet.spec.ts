import { MobileService } from './mobile.service';

describe('Mobile wallet scan counts for every account schema', () => {
  for (const role of ['dealer', 'user', 'electrician', 'counterboy']) {
    it(`returns real scan totals for ${role} without writing unsupported columns`, async () => {
      const service: any = Object.create(MobileService.prototype);
      service.getUserByRole = jest.fn().mockResolvedValue({ walletBalance: 40, totalPoints: 60, totalScans: 0 });
      service.updateUserByRole = jest.fn().mockResolvedValue(undefined);
      service.getDealerElectricians = jest.fn().mockResolvedValue({ total: 2, activeElectricianCount: 1 });
      service.scanRepository = { count: jest.fn().mockResolvedValue(7) };
      const query: any = {};
      for (const method of ['select','addSelect','where','setParameters']) query[method] = jest.fn(() => query);
      query.getRawOne = jest.fn().mockResolvedValue({ totalEarned: '90', totalRedeemed: '50' });
      service.walletRepository = { createQueryBuilder: jest.fn(() => query) };
      const summary = await service.getWalletSummary('account-id', role);
      expect(summary.totalScans).toBe(7);
      expect(summary.totalPoints).toBe(role === 'dealer' ? 40 : 60);
      if (role === 'dealer' || role === 'user') {
        expect(service.updateUserByRole).not.toHaveBeenCalled();
      } else {
        expect(service.updateUserByRole).toHaveBeenCalledWith('account-id', role, { totalScans: 7 });
      }
      if (role === 'dealer') expect(summary.activeElectricianCount).toBe(1);
    });
  }
});
