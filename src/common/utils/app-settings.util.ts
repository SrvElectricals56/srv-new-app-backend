import { BadRequestException } from '@nestjs/common';

export const POINT_SETTING_DEFAULTS = {
  maxPointsPerDay: 500, minRedemptionPoints: 500, minTransferPoints: 100,
  pointsExpiry: 0, cashbackRate: 1, referrerBonus: 500, refereeBonus: 250,
  dealerCommissionRate: 5,
};

export function numericSetting(map: Record<string, string>, key: string, fallback: number): number {
  const raw = map[key];
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function pointSettings(map: Record<string, string>) {
  return { ...Object.fromEntries(Object.entries(POINT_SETTING_DEFAULTS).map(([key, fallback]) =>
    [key, numericSetting(map, key, fallback)],
  )), pointsExpiry: 0, cashbackRate: 1 } as typeof POINT_SETTING_DEFAULTS;
}

export function validateAppSetting(key: string, value: unknown) {
  if (key in POINT_SETTING_DEFAULTS || /^(minimumOrderAmount|.*Min$)/.test(key)) {
    const number = Number(value);
    if (String(value ?? '').trim() === '' || !Number.isFinite(number) || number < 0 ||
      (key === 'cashbackRate' && number !== 1) || (key === 'pointsExpiry' && number !== 0) ||
      (key === 'dealerCommissionRate' && number > 100)) {
      throw new BadRequestException(`Invalid value for ${key}`);
    }
  }
}
