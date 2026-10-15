import { hasRecordedAppInstall } from './app-install.util';

describe('hasRecordedAppInstall', () => {
  it('requires a real first-login timestamp', () => {
    expect(hasRecordedAppInstall(null)).toBe(false);
    expect(hasRecordedAppInstall(undefined)).toBe(false);
    expect(hasRecordedAppInstall('not-a-date')).toBe(false);
    expect(hasRecordedAppInstall('2026-07-16T05:30:00.000Z')).toBe(true);
    expect(hasRecordedAppInstall(new Date('2026-07-16T05:30:00.000Z'))).toBe(true);
  });
});
