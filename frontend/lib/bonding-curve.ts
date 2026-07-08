// Shared bonding-curve math for client-side trade previews.
// Mirrors the server-side logic in lib/trading-engine.ts.

export const BASE_PRICE = 0.01;
export const SCALE_FACTOR = 10000;

export function calculatePrice(totalSupply: number): number {
  return BASE_PRICE * (1 + totalSupply / SCALE_FACTOR);
}

// Tokens received when buying `collateralUsdc` worth at current supply (long).
export function tokensForCollateral(currentSupply: number, collateralUsdc: number): number {
  const a = BASE_PRICE / (2 * SCALE_FACTOR);
  const b = BASE_PRICE * (1 + currentSupply / SCALE_FACTOR);
  const c = -collateralUsdc;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const tokens = (-b + Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, tokens);
}

// Tokens burned when shorting `collateralUsdc` at current supply.
export function shortTokensForCollateral(currentSupply: number, collateralUsdc: number): number {
  const a = BASE_PRICE / (2 * SCALE_FACTOR);
  const b = BASE_PRICE * (1 + currentSupply / SCALE_FACTOR);
  const discriminant = b * b - 4 * a * collateralUsdc;
  if (discriminant < 0) return 0;
  const tokens = (b - Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, Math.min(currentSupply, tokens));
}

/**
 * Estimate size (tokens) and entry price for a trade preview.
 */
export function estimateTrade(
  direction: "long" | "short",
  currentSupply: number,
  collateralUsdc: number
): { sizeTokens: number; entryPrice: number } {
  if (collateralUsdc <= 0) return { sizeTokens: 0, entryPrice: calculatePrice(currentSupply) };

  if (direction === "long") {
    const sizeTokens = tokensForCollateral(currentSupply, collateralUsdc);
    const entryPrice = sizeTokens > 0 ? collateralUsdc / sizeTokens : calculatePrice(currentSupply);
    return { sizeTokens, entryPrice };
  }

  // Short — burn tokens via the bonding curve integral
  const sizeTokens = shortTokensForCollateral(currentSupply, collateralUsdc);
  const entryPrice = sizeTokens > 0 ? collateralUsdc / sizeTokens : calculatePrice(currentSupply);
  return { sizeTokens, entryPrice };
}
