import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

function createService() {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const repository = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const jwtService = {
    verify: jest.fn(),
    sign: jest.fn(),
  };
  const secrets: Record<string, string> = {
    JWT_REFRESH_SECRET: 'refresh-secret-that-is-long-and-unique',
    JWT_REFRESH_EXPIRES_IN: '30d',
  };
  const configService = {
    get: jest.fn((key: string) => secrets[key]),
    getOrThrow: jest.fn((key: string) => secrets[key]),
  };
  const service = new AuthService(
    repository as any,
    jwtService as any,
    configService as any,
  );
  return { service, repository, jwtService, queryBuilder };
}

describe('AuthService refresh-token sessions', () => {
  it('rejects a validly signed token that is not the active server-side session', async () => {
    const context = createService();
    context.jwtService.verify.mockReturnValue({
      sub: 'admin-id',
      tokenVersion: 0,
    });
    context.repository.findOne.mockResolvedValue({
      id: 'admin-id',
      isActive: true,
      tokenVersion: 0,
      refreshToken: '0'.repeat(64),
    });

    await expect(context.service.refreshToken('stolen-old-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotates the refresh token and stores only its digest', async () => {
    const context = createService();
    const activeToken = 'active-refresh-token';
    const activeHash = (context.service as any).hashRefreshToken(activeToken);
    context.jwtService.verify.mockReturnValue({
      sub: 'admin-id',
      tokenVersion: 2,
    });
    context.jwtService.sign
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');
    context.repository.findOne.mockResolvedValue({
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'admin',
      isActive: true,
      tokenVersion: 2,
      refreshToken: activeHash,
    });

    await expect(context.service.refreshToken(activeToken)).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(context.repository.update).toHaveBeenCalledWith(
      'admin-id',
      expect.objectContaining({
        refreshToken: expect.not.stringContaining('new-refresh-token'),
      }),
    );
  });

  it('invalidates access and refresh tokens on logout', async () => {
    const context = createService();
    await context.service.logout('admin-id');

    expect(context.queryBuilder.set).toHaveBeenCalledWith({
      refreshToken: null,
      tokenVersion: expect.any(Function),
    });
    expect(context.queryBuilder.execute).toHaveBeenCalledTimes(1);
  });
});
