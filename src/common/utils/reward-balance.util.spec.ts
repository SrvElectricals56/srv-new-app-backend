import { resolveSpendableRewardBalance } from './reward-balance.util';

describe('resolveSpendableRewardBalance', () => {
  it('uses legacy total points when the wallet field was not synchronized', () => {
    expect(resolveSpendableRewardBalance(10_000, 100_000)).toBe(100_000);
  });

  it('uses the wallet when it is the newer higher value', () => {
    expect(resolveSpendableRewardBalance(500, 200)).toBe(500);
  });

  it('keeps dealer bonus accounting separate from reward points', () => {
    expect(resolveSpendableRewardBalance(500, 100_000, true)).toBe(500);
  });
});
