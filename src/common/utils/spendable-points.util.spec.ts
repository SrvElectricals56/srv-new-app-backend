import { getSpendableProductPoints } from './spendable-points.util';

describe('getSpendableProductPoints', () => {
  it('uses the normal wallet even when a dealer has a different bonus balance', () => {
    expect(getSpendableProductPoints({ walletBalance: 900, bonusPoints: 25 } as any)).toBe(900);
  });

  it('normalizes missing, invalid, and negative balances safely', () => {
    expect(getSpendableProductPoints(undefined)).toBe(0);
    expect(getSpendableProductPoints({ walletBalance: 'invalid' })).toBe(0);
    expect(getSpendableProductPoints({ walletBalance: -10 })).toBe(0);
  });
});
