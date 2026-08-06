type QrEligibilityRecord = {
  isActive?: boolean | null;
  legacyId?: string | number | null;
  product?: { isActive?: boolean | null } | null;
};

export function isQrRedeemable(qr?: QrEligibilityRecord | null): boolean {
  if (!qr?.isActive || !qr.product) return false;
  return Boolean(qr.product.isActive || qr.legacyId !== null && qr.legacyId !== undefined);
}
