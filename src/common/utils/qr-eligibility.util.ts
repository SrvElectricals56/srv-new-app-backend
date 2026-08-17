type QrEligibilityRecord = {
  isActive?: boolean | null;
  legacyId?: string | number | null;
  product?: {
    isActive?: boolean | null;
    sku?: string | null;
    name?: string | null;
  } | null;
};

function isSystemRewardProduct(product: NonNullable<QrEligibilityRecord['product']>): boolean {
  const sku = String(product.sku ?? '').trim().toUpperCase();
  const name = String(product.name ?? '').trim().toLowerCase();
  return (
    ['SRV-WELCOME', 'SRV-ADJUST', 'ADJUST-POINTS'].includes(sku) ||
    name.includes('welcome to srv') ||
    name.includes('adjust point')
  );
}

export function isQrRedeemable(qr?: QrEligibilityRecord | null): boolean {
  if (!qr?.isActive || !qr.product) return false;
  return Boolean(
    qr.product.isActive ||
    isSystemRewardProduct(qr.product) ||
    qr.legacyId !== null && qr.legacyId !== undefined
  );
}
