import { SettingsService } from './settings.service';

describe('SettingsService tier synchronization', () => {
  function createService() {
    return new SettingsService({} as any, {} as any, {} as any, {} as any);
  }

  it('casts tier updates to the enum type actually used by the database column', async () => {
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { key: 'silverMin', value: '0' },
          { key: 'goldMin', value: '1001' },
          { key: 'platinumMin', value: '5001' },
          { key: 'diamondMin', value: '10001' },
        ]),
      }),
      query: jest.fn()
        .mockResolvedValueOnce([{ schema: 'public', name: 'MemberTier' }])
        .mockResolvedValueOnce([]),
    };

    await (createService() as any).syncConfiguredTiers(manager, ['silverMin']);

    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('information_schema.columns'),
      ['electricians'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('tier = next.tier::"public"."MemberTier"'),
      [1001, 5001, 10001],
    );
  });

  it('supports the migration-era table-specific enum name as well', async () => {
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([]),
      }),
      query: jest.fn()
        .mockResolvedValueOnce([{ schema: 'public', name: 'dealers_tier_enum' }])
        .mockResolvedValueOnce([]),
    };

    await (createService() as any).syncConfiguredTiers(manager, ['dealerSilverMin']);

    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('tier = next.tier::"public"."dealers_tier_enum"'),
      [11, 26, 51],
    );
  });
});
