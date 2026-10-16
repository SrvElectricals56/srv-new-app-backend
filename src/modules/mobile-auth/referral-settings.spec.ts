import { MobileAuthService } from './mobile-auth.service';
import { UserRole } from '../../common/enums';

describe('Configured referral rewards', () => {
  it('credits different configured rewards once and respects disabling', async () => {
    const service: any = Object.create(MobileAuthService.prototype);
    const referrer = { id: 'referrer', role: UserRole.ELECTRICIAN, code: 'REF' };
    const referee = { id: 'referee', role: UserRole.ELECTRICIAN };
    service.findReferralOwner = jest.fn().mockResolvedValue(referrer);
    service.creditReferralMember = jest.fn();
    const settings = { referrerBonus: '30', refereeBonus: '10', referralEnabled: 'true' };
    const manager = {
      getRepository: () => ({ find: async () => Object.entries(settings).map(([key, value]) => ({ key, value })) }),
      query: jest.fn().mockResolvedValueOnce([{ id: 'reward' }]).mockResolvedValue([]),
    };
    await service.applyReferralReward(manager, 'REF', referee);
    expect(service.creditReferralMember).toHaveBeenNthCalledWith(1, manager, referrer, referee, 30);
    expect(service.creditReferralMember).toHaveBeenNthCalledWith(2, manager, referee, referrer, 10);
    await service.applyReferralReward(manager, 'REF', referee);
    expect(service.creditReferralMember).toHaveBeenCalledTimes(2);
    settings.referralEnabled = 'false';
    await service.applyReferralReward(manager, 'REF', referee);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
});
