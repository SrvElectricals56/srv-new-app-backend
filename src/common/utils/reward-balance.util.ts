/**
 * Legacy imports and older admin tools could update totalPoints without also
 * updating walletBalance. Reward spending honours the larger value, and the
 * next successful mutation writes both fields back in sync.
 * Dealer bonus remains a separate cash-withdrawal balance.
 */
export function resolveSpendableRewardBalance(
  walletBalance: unknown,
  totalPoints: unknown,
  isDealer = false,
): number {
  const toBalance = (value: unknown) => {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  };

  const wallet = toBalance(walletBalance);
  return isDealer ? wallet : Math.max(wallet, toBalance(totalPoints));
}
