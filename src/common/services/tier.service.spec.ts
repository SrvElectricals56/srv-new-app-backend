import { TierService } from './tier.service';
import { MemberTier } from '../enums';

describe('Configured tiers', () => {
  it('uses current admin thresholds for electricians and dealers', async () => {
    const values = { goldMin: '21', platinumMin: '50', diamondMin: '100', dealerGoldMin: '2', dealerPlatinumMin: '4', dealerDiamondMin: '6' };
    const service = new TierService({} as any, {} as any, {
      find: async () => Object.entries(values).map(([key, value]) => ({ key, value })),
    } as any);
    expect(await service.calculateElectricianTier(20)).toBe(MemberTier.SILVER);
    expect(await service.calculateElectricianTier(21)).toBe(MemberTier.GOLD);
    expect(await service.calculateElectricianTier(50)).toBe(MemberTier.PLATINUM);
    expect(await service.calculateElectricianTier(100)).toBe(MemberTier.DIAMOND);
    expect(await service.calculateDealerTier(2)).toBe(MemberTier.GOLD);
    expect(await service.calculateDealerTier(6)).toBe(MemberTier.DIAMOND);
    values.goldMin = '30';
    expect(await service.calculateElectricianTier(21)).toBe(MemberTier.SILVER);
  });
});
