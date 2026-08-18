import { UserStatus } from '../enums';
import { getElectricianActivityStatus } from './electrician-activity.util';

const now = new Date('2026-08-18T06:00:00.000Z');

describe('getElectricianActivityStatus', () => {
  it('keeps a new zero-wallet account active during its first 30 days', () => {
    expect(getElectricianActivityStatus({
      accountStatus: UserStatus.ACTIVE,
      joinedDate: '2026-08-01T06:00:00.000Z',
      lastScanAt: null,
      now,
    })).toBe('active');
  });

  it('marks an electrician with a scan in the last seven days proactive', () => {
    expect(getElectricianActivityStatus({
      accountStatus: UserStatus.ACTIVE,
      joinedDate: '2025-01-01T00:00:00.000Z',
      lastScanAt: '2026-08-12T06:00:00.000Z',
      now,
    })).toBe('proactive');
  });

  it('keeps an electrician with a scan in the last 30 days active', () => {
    expect(getElectricianActivityStatus({
      accountStatus: UserStatus.ACTIVE,
      joinedDate: '2025-01-01T00:00:00.000Z',
      lastScanAt: '2026-07-25T06:00:00.000Z',
      now,
    })).toBe('active');
  });

  it('marks an established electrician inactive after 30 full days without a scan', () => {
    expect(getElectricianActivityStatus({
      accountStatus: UserStatus.ACTIVE,
      joinedDate: '2025-01-01T00:00:00.000Z',
      lastScanAt: '2026-07-18T05:59:59.000Z',
      now,
    })).toBe('inactive');
  });

  it('never changes an explicitly suspended or inactive account from activity alone', () => {
    for (const accountStatus of [UserStatus.SUSPENDED, UserStatus.INACTIVE]) {
      expect(getElectricianActivityStatus({
        accountStatus,
        joinedDate: now,
        lastScanAt: now,
        now,
      })).toBe('inactive');
    }
  });
});
