export interface PriceChange {
  direction: "up" | "down";
  percentage: number;
  amount: number;
}

/**
 * Compares a current price with the same reference price used by the 90-day
 * chart. A positive signed percentage means the current price is cheaper;
 * a negative value means it is more expensive.
 */
export function getSignedPriceChangePercentage(currentPrice: number, comparisonPrice: number): number | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(comparisonPrice) || comparisonPrice <= 0) return null;
  return ((comparisonPrice - currentPrice) / comparisonPrice) * 100;
}

export function getPriceChange(currentPrice: number, comparisonPrice: number): PriceChange | null {
  const signedPercentage = getSignedPriceChangePercentage(currentPrice, comparisonPrice);
  if (signedPercentage == null) return null;

  const percentage = Math.round(Math.abs(signedPercentage));
  if (percentage === 0) return null;

  return {
    direction: signedPercentage > 0 ? "down" : "up",
    percentage,
    amount: Math.abs(comparisonPrice - currentPrice),
  };
}
