import { isQrRedeemable } from './qr-eligibility.util';

describe('isQrRedeemable', () => {
  it('allows a pending migrated QR whose historical product is archived', () => {
    expect(isQrRedeemable({
      isActive: true,
      legacyId: '123',
      product: { isActive: false },
    })).toBe(true);
  });

  it('does not allow a new QR after its product is archived', () => {
    expect(isQrRedeemable({
      isActive: true,
      legacyId: null,
      product: { isActive: false },
    })).toBe(false);
  });

  it.each([
    { sku: 'SRV-WELCOME', name: 'Welcome to SRV' },
    { sku: 'SRV-ADJUST', name: 'Adjust Points' },
  ])('allows a new QR for hidden system reward product $sku', (product) => {
    expect(isQrRedeemable({
      isActive: true,
      legacyId: null,
      product: { ...product, isActive: false },
    })).toBe(true);
  });

  it('does not allow an inactive QR', () => {
    expect(isQrRedeemable({
      isActive: false,
      legacyId: '123',
      product: { isActive: true },
    })).toBe(false);
  });
});
