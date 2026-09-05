import { MobileAuthService } from './mobile-auth.service';
import { UserStatus } from '../../common/enums';

const signupData = {
  name: 'Test Electrician',
  phone: '9812345678',
  city: 'Ludhiana',
  district: 'Ludhiana',
  state: 'Punjab',
  pincode: '141001',
  dealerPhone: '9712345678',
  signupVerificationToken: 'verified-signup-token',
};

function createService(options: {
  existingElectrician?: Record<string, unknown>;
  failSubDealerUpdate?: boolean;
} = {}) {
  const savedElectrician = {
    id: 'electrician-id',
    ...signupData,
    electricianCode: 'ELC-9812345678',
    status: UserStatus.ACTIVE,
    fallbackDealerName: 'SRV Sub Dealer',
    fallbackDealerPhone: signupData.dealerPhone,
  };
  const electricianRepository = {
    increment: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest
      .fn()
      .mockResolvedValueOnce(options.existingElectrician ?? null)
      .mockResolvedValue(options.existingElectrician ?? savedElectrician),
  };
  const transactionalElectricianRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: savedElectrician.id, ...value })),
    find: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn(() => transactionalElectricianRepository),
    query: options.failSubDealerUpdate
      ? jest.fn().mockRejectedValue(new Error('sub-dealer update failed'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const crossRolePhoneService = {
    assertPhoneAvailableForRole: jest.fn().mockResolvedValue(undefined),
    findPrimaryRegistrationByPhone: jest.fn().mockResolvedValue(null),
  };
  const jwtService: any = {
    verify: jest.fn(() => ({
      purpose: 'signup_otp',
      phone: signupData.phone,
      role: 'electrician',
    })),
    sign: jest.fn(() => 'signed-token'),
    signAsync: jest.fn(async () => 'signed-signup-token'),
  };
  const configService = {
    get: jest.fn(() => 'test-secret'),
  };

  const service = new MobileAuthService(
    electricianRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    { syncDealerTier: jest.fn() } as any,
    crossRolePhoneService as any,
    jwtService as any,
    configService as any,
  );

  return {
    service,
    electricianRepository,
    transactionalElectricianRepository,
    manager,
    dataSource,
    crossRolePhoneService,
    jwtService,
  };
}

describe('MobileAuthService electrician signup', () => {
  it('assigns the fallback electrician code on the server and ignores forged assignment fields', async () => {
    const context = createService();

    const result = await context.service.registerElectrician({
      ...signupData,
      electricianCode: 'CLIENT-CONTROLLED-001',
      dealerCode: 'CLIENT-CONTROLLED',
      tier: 'Diamond',
      status: 'suspended',
    } as any);

    expect(context.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(context.transactionalElectricianRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: signupData.phone,
        electricianCode: `ELC-${signupData.phone}`,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(context.manager.query).toHaveBeenCalledTimes(1);
    expect(result.user.electricianCode).toBe(`ELC-${signupData.phone}`);
    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(result.accessToken).toBe('signed-token');
  });

  it('returns the existing electrician for a verified signup replay', async () => {
    const existingElectrician = {
      id: 'existing-id',
      name: signupData.name,
      phone: signupData.phone,
      electricianCode: `ELC-${signupData.phone}`,
      status: UserStatus.ACTIVE,
    };
    const context = createService({ existingElectrician });

    const result = await context.service.registerElectrician(signupData);

    expect(result.user.id).toBe(existingElectrician.id);
    expect(context.dataSource.transaction).not.toHaveBeenCalled();
    expect(context.crossRolePhoneService.assertPhoneAvailableForRole).not.toHaveBeenCalled();
  });

  it('allows a released app to finish signup from the server-side verified OTP proof', async () => {
    const context = createService();
    jest.spyOn(context.service as any, 'generateOtp').mockReturnValue('4321');

    await context.service.sendSignupOtp(signupData.phone, 'electrician');
    await context.service.verifySignupOtp(signupData.phone, 'electrician', '4321');
    const result = await context.service.registerElectrician({
      ...signupData,
      signupVerificationToken: undefined,
    });

    expect(context.jwtService.signAsync).toHaveBeenCalledTimes(1);
    expect(context.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.user.phone).toBe(signupData.phone);
  });

  it('does not issue login tokens when the transactional sub-dealer update fails', async () => {
    const context = createService({ failSubDealerUpdate: true });

    await expect(context.service.registerElectrician(signupData)).rejects.toThrow(
      'sub-dealer update failed',
    );

    expect(context.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(context.transactionalElectricianRepository.save).toHaveBeenCalledTimes(1);
    expect(context.jwtService.sign).not.toHaveBeenCalled();
  });
});

describe('MobileAuthService session revocation', () => {
  it('rejects a refresh token issued before tokenVersion changed', async () => {
    const context = createService();
    context.jwtService.verify.mockReturnValueOnce({
      sub: 'electrician-id',
      phone: signupData.phone,
      role: 'electrician',
      tokenVersion: 1,
    });
    jest.spyOn(context.service as any, 'findUserByPhone').mockResolvedValue({
      id: 'electrician-id',
      phone: signupData.phone,
      role: 'electrician',
      status: UserStatus.ACTIVE,
      tokenVersion: 2,
    });

    await expect(context.service.refreshToken('old-refresh-token')).rejects.toThrow(
      'Invalid refresh token',
    );
  });

  it('increments tokenVersion during authenticated logout', async () => {
    const context = createService();

    await expect(
      context.service.logout('electrician-id', 'electrician'),
    ).resolves.toEqual({
      success: true,
      message: 'Logged out successfully',
    });
    expect(context.electricianRepository.increment).toHaveBeenCalledWith(
      { id: 'electrician-id' },
      'tokenVersion',
      1,
    );
  });
});

describe('MobileAuthService app-install tracking', () => {
  it('records first login when a stale imported install flag has no timestamp', async () => {
    const context = createService({
      existingElectrician: {
        id: 'electrician-id',
        appInstalled: true,
        firstAppLoginAt: null,
      },
    });

    await (context.service as any).touchActivity('electrician-id', 'electrician');

    expect(context.electricianRepository.update).toHaveBeenCalledWith(
      'electrician-id',
      expect.objectContaining({
        appInstalled: true,
        firstAppLoginAt: expect.any(Date),
        lastActivityAt: expect.any(Date),
      }),
    );
  });
});
