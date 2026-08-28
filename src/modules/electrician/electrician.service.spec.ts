import { BadRequestException } from '@nestjs/common';
import { ElectricianService } from './electrician.service';

describe('ElectricianService admin point fields', () => {
  const tierService = {
    calculateElectricianTier: jest.fn((points: number) => points >= 1001 ? 'Gold' : 'Silver'),
  };
  const service = new ElectricianService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    tierService as any,
    {} as any,
  );

  const normalize = (data: Record<string, unknown>) =>
    (service as any).normalizeIndependentPointFields(data);

  beforeEach(() => jest.clearAllMocks());

  it('updates total points without changing wallet balance', () => {
    const data: Record<string, unknown> = { totalPoints: 1500 };
    normalize(data);
    expect(data).toEqual({ totalPoints: 1500, tier: 'Gold' });
    expect(data).not.toHaveProperty('walletBalance');
  });

  it('updates wallet balance without changing total points or tier', () => {
    const data: Record<string, unknown> = { walletBalance: 275 };
    normalize(data);
    expect(data).toEqual({ walletBalance: 275 });
    expect(data).not.toHaveProperty('totalPoints');
    expect(data).not.toHaveProperty('tier');
  });

  it('rejects negative values independently', () => {
    expect(() => normalize({ walletBalance: -1 })).toThrow(BadRequestException);
    expect(() => normalize({ totalPoints: -1 })).toThrow(BadRequestException);
  });
});

describe('ElectricianService app-install date filtering', () => {
  it('uses first app login for date shortcuts even when app status is not supplied', async () => {
    const queryBuilder: Record<string, jest.Mock> = {};
    for (const method of [
      'select', 'leftJoin', 'addSelect', 'andWhere', 'setParameters',
      'orderBy', 'addOrderBy', 'skip', 'take',
    ]) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);

    const service = new ElectricianService(
      { createQueryBuilder: jest.fn(() => queryBuilder) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findAll(
      1, 20,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined,
      '2026-08-28', '2026-08-28', undefined, 'installed',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'electrician.firstAppLoginAt IS NOT NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      `(electrician.firstAppLoginAt AT TIME ZONE 'Asia/Kolkata')::date >= CAST(:dateFrom AS date)`,
      { dateFrom: '2026-08-28' },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'electrician.firstAppLoginAt',
      'DESC',
    );
  });
});
