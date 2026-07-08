import { supabaseAdmin } from "./supabaseServer";
import { calculatePrice, closePosition } from "./trading-engine";

export type LiquidationResult = {
  liquidated: string[];
  errors: { position_id: string; error: string }[];
};

/**
 * Check all open short positions. If current market price has moved against
 * the short such that unrealised losses exceed collateral, auto-close it.
 *
 * Can be called on-demand or after every price-changing operation.
 */
export async function checkLiquidations(marketId?: string): Promise<LiquidationResult> {
  // Fetch all open short positions, optionally filtered by market
  let query = supabaseAdmin
    .from("startup_positions")
    .select("*, startup_markets!inner(total_supply)")
    .eq("direction", "short")
    .eq("status", "open");

  if (marketId) {
    query = query.eq("market_id", marketId);
  }

  const { data: positions, error } = await query;

  if (error || !positions) {
    return { liquidated: [], errors: [] };
  }

  const liquidated: string[] = [];
  const errors: { position_id: string; error: string }[] = [];

  for (const position of positions) {
    const totalSupply = Number(position.startup_markets.total_supply);
    const currentPrice = calculatePrice(totalSupply);
    const entryPrice = Number(position.entry_price);
    const sizeTokens = Number(position.size_tokens);
    const collateral = Number(position.collateral_usdc);

    // Short PnL = (entryPrice - currentPrice) * sizeTokens
    const unrealisedPnl = (entryPrice - currentPrice) * sizeTokens;
    const loss = -unrealisedPnl; // positive when losing money

    // Liquidate if loss exceeds collateral
    if (loss >= collateral) {
      try {
        await closePosition(position.user_id, position.id);
        liquidated.push(position.id);
      } catch (err) {
        errors.push({
          position_id: position.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return { liquidated, errors };
}

/**
 * Run liquidation checks for a specific market. Intended to be called
 * after any trade that updates market price.
 */
export async function checkMarketLiquidations(marketId: string): Promise<LiquidationResult> {
  return checkLiquidations(marketId);
}
