export const BUNDLED_APP_ICON_KEYS = [
  'default',
  'diwali',
  'republic-day',
] as const;

export type BundledAppIconKey = (typeof BUNDLED_APP_ICON_KEYS)[number];

export function isBundledAppIconKey(value?: string | null): value is BundledAppIconKey {
  return BUNDLED_APP_ICON_KEYS.includes(value as BundledAppIconKey);
}
