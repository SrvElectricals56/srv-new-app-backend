/**
 * Product checkout uses the normal reward wallet for every role. Dealer bonus
 * points belong to the separate 5% commission payout flow.
 */
export function getSpendableProductPoints(user: { walletBalance?: unknown } | null | undefined): number {
  const balance = Number(user?.walletBalance ?? 0);
  return Number.isFinite(balance) ? Math.max(0, balance) : 0;
}
