import { JwtService } from '@nestjs/jwt';
import { MobileAuthService } from './mobile-auth.service';
import { UserStatus } from '../../common/enums';

function customerContext() {
  let account: any = { id: 'customer-audit', name: 'Customer', phone: '9000000000', googleSubject: 'google-audit', phoneVerified: false, status: UserStatus.ACTIVE, totalPoints: 20, walletBalance: 0, tokenVersion: 0 };
  const repository = {
    create: jest.fn(value => value),
    save: jest.fn(async value => (account = { ...account, ...value })),
    findOne: jest.fn(async () => account),
    findOneByOrFail: jest.fn(async () => ({ ...account, totalPoints: 20, walletBalance: 20 })),
    update: jest.fn(async (_id, value) => { account = { ...account, ...value }; return { affected: 1 }; }),
    createQueryBuilder: jest.fn(),
  };
  const manager = { getRepository: jest.fn(() => repository) };
  const crossRole = { assertPhoneAvailableForRole: jest.fn().mockResolvedValue(undefined) };
  const jwt = new JwtService({ secret: 'local-regression-test-secret' });
  const config = { get: (key: string) => key === 'JWT_SECRET' || key === 'JWT_REFRESH_SECRET' ? 'local-regression-test-secret' : undefined };
  const service = new MobileAuthService({} as any, {} as any, repository as any, {} as any, { count: jest.fn().mockResolvedValue(0) } as any, { transaction: async callback => callback(manager) } as any, {} as any, crossRole as any, jwt, config as any);
  const proof = (phone: string, role = 'user') => jwt.sign({ purpose: 'signup_otp', phone, role }, { expiresIn: '10m' });
  return { service, repository, crossRole, jwt, proof };
}

describe('Customer OTP and Google profile regressions', () => {
  it('accepts a signed customer OTP proof and returns referral points in the registration response', async () => {
    const c = customerContext();
    jest.spyOn(c.service as any, 'applyReferralReward').mockResolvedValue(undefined);
    const result = await c.service.registerUser({ name: 'New customer', phone: '9812345678', signupVerificationToken: c.proof('9812345678'), referralCode: 'FRIEND' });
    expect(result.user.phone).toBe('9812345678');
    expect(result.user.totalPoints).toBe(20);
    expect(c.repository.findOneByOrFail).toHaveBeenCalledWith({ id: 'customer-audit' });
  });
  it('rejects a signup proof for another phone or role', async () => {
    const c = customerContext();
    for (const token of [c.proof('9812345679'), c.proof('9812345678', 'dealer')]) {
      await expect(c.service.registerUser({ name: 'Customer', phone: '9812345678', signupVerificationToken: token })).rejects.toThrow();
    }
    expect(c.repository.save).not.toHaveBeenCalled();
  });
  it('saves and exposes a Google customer phone only after matching OTP verification', async () => {
    const c = customerContext();
    expect((await c.service.getProfile('customer-audit', 'user')).phone).toBe('');
    await expect(c.service.updateProfile('customer-audit', 'user', { phone: '9812345678' })).rejects.toThrow();
    expect(c.repository.update).not.toHaveBeenCalled();
    const profile = await c.service.updateProfile('customer-audit', 'user', { phone: '9812345678', phoneVerificationToken: c.proof('9812345678') });
    expect(profile.phone).toBe('9812345678');
    expect(profile.phoneVerified).toBe(true);
    expect(profile.totalPoints).toBe(20); // A stale walletBalance=0 must not hide points.
    expect(c.crossRole.assertPhoneAvailableForRole).toHaveBeenCalledWith('9812345678', 'user');
    expect((await c.service.getProfile('customer-audit', 'user')).phone).toBe('9812345678');
  });
  it('keeps Google refresh sessions working before and after a verified phone update', async () => {
    const c = customerContext();
    const token = c.jwt.sign({ sub: 'customer-audit', phone: '9000000000', role: 'user', tokenVersion: 0 });
    expect((await c.service.refreshToken(token)).accessToken).toBeTruthy();
    await c.service.updateProfile('customer-audit', 'user', { phone: '9812345678', phoneVerificationToken: c.proof('9812345678') });
    const refreshed = await c.service.refreshToken(token);
    expect(c.jwt.verify(refreshed.accessToken).phone).toBe('9812345678');
  });
  it('rejects a revoked Google refresh session', async () => {
    const c = customerContext();
    const token = c.jwt.sign({ sub: 'customer-audit', phone: '9000000000', role: 'user', tokenVersion: 0 });
    await c.repository.update('customer-audit', { tokenVersion: 1 });
    await expect(c.service.refreshToken(token)).rejects.toThrow('Invalid refresh token');
  });
});
