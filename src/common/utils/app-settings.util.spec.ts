import { pointSettings, validateAppSetting } from './app-settings.util';

describe('App settings validation', () => {
  it.each(['-1', 'NaN', 'Infinity', ''])('rejects invalid minimum %s', value => {
    expect(() => validateAppSetting('minRedemptionPoints', value)).toThrow();
  });
  it('keeps zero limits and rewards, but disallows a zero exchange rate', () => {
    expect(() => validateAppSetting('maxPointsPerDay', '0')).not.toThrow();
    expect(() => validateAppSetting('cashbackRate', '0')).toThrow();
    expect(() => validateAppSetting('dealerCommissionRate', '101')).toThrow();
    expect(pointSettings({ maxPointsPerDay: '0', referrerBonus: '0' })).toMatchObject({ maxPointsPerDay: 0, referrerBonus: 0 });
  });
  it('never expires points or changes the one-to-one withdrawal value from legacy settings', () => {
    expect(pointSettings({ pointsExpiry: '365', cashbackRate: '5' })).toMatchObject({ pointsExpiry: 0, cashbackRate: 1 });
    expect(() => validateAppSetting('pointsExpiry', '365')).toThrow();
    expect(() => validateAppSetting('cashbackRate', '5')).toThrow();
  });
});
