import { supabaseAdmin } from "./supabaseServer";

const BASE_PRICE = 0.01;
const SCALE_FACTOR = 10000;
const TRADING_FEE_RATE = 0.01;
const GRADUATION_THRESHOLD_USD = 50;

export type TradeResult = {
  position_id: string;
  direction: "long" | "short";
  collateral_usdc: number;
  size_tokens: number;
  entry_price: number;
  current_price: number;
  available_usdc: number;
  locked_usdc: number;
};

export type CloseResult = {
  position_id: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  pnl: number;
  current_price: number;
  available_usdc: number;
  locked_usdc: number;
};

// ── Bonding Curve ───────────────────────────────────────────

export function calculatePrice(totalSupply: number): number {
  return BASE_PRICE * (1 + totalSupply / SCALE_FACTOR);
}

// Tokens received when buying `collateralUsdc` worth at current supply (long).
// We integrate the bonding curve: ∫ price ds from S to S+Δ = collateral
// price(s) = BASE_PRICE * (1 + s / SCALE_FACTOR)
// integral = BASE_PRICE * [Δ + (2S*Δ + Δ²) / (2 * SCALE_FACTOR)]
// Solving for Δ given collateral:
// aΔ² + bΔ - C = 0 where a = BASE_PRICE/(2*SCALE_FACTOR), b = BASE_PRICE*(1+S/SCALE_FACTOR), C = collateral
function tokensForCollateral(currentSupply: number, collateralUsdc: number): number {
  const a = BASE_PRICE / (2 * SCALE_FACTOR);
  const b = BASE_PRICE * (1 + currentSupply / SCALE_FACTOR);
  const c = -collateralUsdc;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const tokens = (-b + Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, tokens);
}

// Tokens burned when shorting `collateralUsdc` at current supply.
// We integrate the bonding curve: ∫ price ds from S-Δ to S = collateral
// aΔ² - bΔ + C = 0 where a = BASE_PRICE/(2*SCALE_FACTOR), b = BASE_PRICE*(1+S/SCALE_FACTOR), C = collateral
function shortTokensForCollateral(currentSupply: number, collateralUsdc: number): number {
  const a = BASE_PRICE / (2 * SCALE_FACTOR);
  const b = BASE_PRICE * (1 + currentSupply / SCALE_FACTOR);
  const discriminant = b * b - 4 * a * collateralUsdc;
  if (discriminant < 0) return 0;
  const tokens = (b - Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, Math.min(currentSupply, tokens));
}

// USDC received when selling `tokens` from current supply.
// integral from (S - tokens) to S of price ds
function collateralForTokens(currentSupply: number, tokens: number): number {
  const newSupply = currentSupply - tokens;
  if (newSupply < 0) return 0;
  // Integral: BASE_PRICE * [tokens + (S² - newSupply²) / (2*SCALE_FACTOR)]
  // simplify: BASE_PRICE * [tokens + (2*S*tokens - tokens²) / (2*SCALE_FACTOR)]
  // which = BASE_PRICE * [tokens * (1 + (2*S - tokens) / (2*SCALE_FACTOR))]
  const usdc =
    BASE_PRICE * (tokens + (2 * currentSupply * tokens - tokens * tokens) / (2 * SCALE_FACTOR));
  return Math.max(0, usdc);
}

// ── Open Position ───────────────────────────────────────────

export async function openPosition(
  userId: string,
  marketId: string,
  direction: "long" | "short",
  collateralUsdc: number
): Promise<TradeResult> {
  if (collateralUsdc <= 0) {
    throw new Error("Collateral must be positive");
  }

  // Fetch balance
  const { data: balance, error: balError } = await supabaseAdmin
    .from("balances")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (balError || !balance) throw new Error("Balance not found");
  const openFee = collateralUsdc * TRADING_FEE_RATE;
  if (balance.available_usdc < collateralUsdc + openFee) {
    throw new Error("Insufficient balance (including 1% trading fee)");
  }

  // Fetch market
  const { data: market, error: mktError } = await supabaseAdmin
    .from("startup_markets")
    .select("*")
    .eq("id", marketId)
    .single();

  if (mktError || !market) throw new Error("Market not found");

  const currentSupply = Number(market.total_supply);
  let sizeTokens: number;
  let newSupply: number;
  let entryPrice: number;

  if (direction === "long") {
    // Buy tokens — mint into supply
    sizeTokens = tokensForCollateral(currentSupply, collateralUsdc);
    if (sizeTokens <= 0) throw new Error("Trade too small");
    newSupply = currentSupply + sizeTokens;
    entryPrice = collateralUsdc / sizeTokens;
  } else {
    // Short — burn tokens from supply using the bonding curve integral
    if (currentSupply === 0) {
      throw new Error("No liquidity yet. Someone must go long first.");
    }
    sizeTokens = shortTokensForCollateral(currentSupply, collateralUsdc);
    if (sizeTokens <= 0) {
      throw new Error("Trade too small");
    }
    if (sizeTokens >= currentSupply) {
      throw new Error("Short size too large for current liquidity.");
    }
    newSupply = currentSupply - sizeTokens;
    entryPrice = collateralUsdc / sizeTokens;
  }

  const newPrice = calculatePrice(newSupply);

  // Deduct collateral + fee from available, add collateral to locked
  const newAvailable = Number(balance.available_usdc) - collateralUsdc - openFee;
  const newLocked = Number(balance.locked_usdc) + collateralUsdc;

  // Execute atomic updates
  await updateBalance(userId, newAvailable, newLocked);
  await updateMarket(marketId, newPrice, newSupply, collateralUsdc, openFee);

  // Create position
  const { data: position, error: posError } = await supabaseAdmin
    .from("startup_positions")
    .insert({
      user_id: userId,
      market_id: marketId,
      direction,
      collateral_usdc: collateralUsdc,
      size_tokens: sizeTokens,
      entry_price: entryPrice,
      status: "open",
    })
    .select("id")
    .single();

  if (posError || !position) throw new Error("Failed to create position");

  // Record transaction
  await supabaseAdmin.from("startup_transactions").insert({
    user_id: userId,
    type: "fee",
    amount_usdc: openFee,
    description: `Opened ${direction} on market ${marketId} with ${collateralUsdc} USDC (fee ${openFee.toFixed(6)} USDC)`,
  });

  return {
    position_id: position.id,
    direction,
    collateral_usdc: collateralUsdc,
    size_tokens: sizeTokens,
    entry_price: entryPrice,
    current_price: newPrice,
    available_usdc: newAvailable,
    locked_usdc: newLocked,
  };
}

// ── Close Position ──────────────────────────────────────────

export async function closePosition(
  userId: string,
  positionId: string
): Promise<CloseResult> {
  // Fetch position
  const { data: position, error: posError } = await supabaseAdmin
    .from("startup_positions")
    .select("*")
    .eq("id", positionId)
    .eq("user_id", userId)
    .eq("status", "open")
    .single();

  if (posError || !position) throw new Error("Open position not found");

  // Fetch market
  const { data: market, error: mktError } = await supabaseAdmin
    .from("startup_markets")
    .select("*")
    .eq("id", position.market_id)
    .single();

  if (mktError || !market) throw new Error("Market not found");

  // Fetch balance
  const { data: balance, error: balError } = await supabaseAdmin
    .from("balances")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (balError || !balance) throw new Error("Balance not found");

  const currentSupply = Number(market.total_supply);
  const sizeTokens = Number(position.size_tokens);
  const collateral = Number(position.collateral_usdc);
  const entryPrice = Number(position.entry_price);

  let exitPrice: number;
  let pnl: number;
  let newSupply: number;

  if (position.direction === "long") {
    // Sell tokens — burn from supply
    const proceeds = collateralForTokens(currentSupply, sizeTokens);
    newSupply = currentSupply - sizeTokens;
    exitPrice = proceeds / sizeTokens;
    pnl = (exitPrice - entryPrice) * sizeTokens;
  } else {
    // Close short — mint tokens back into supply
    newSupply = currentSupply + sizeTokens;
    exitPrice = calculatePrice(currentSupply);
    pnl = (entryPrice - exitPrice) * sizeTokens;
  }

  const newPrice = calculatePrice(newSupply);

  // Settle: release collateral + add PnL, deduct close fee
  const settlement = collateral + pnl;
  const settledAmount = Math.max(0, settlement); // can't go below 0
  const closeFee = collateral * TRADING_FEE_RATE;
  const newAvailable = Number(balance.available_usdc) + settledAmount - closeFee;
  const newLocked = Number(balance.locked_usdc) - collateral;

  // Update balance
  await updateBalance(userId, newAvailable, Math.max(0, newLocked));

  // Update market
  await updateMarket(position.market_id, newPrice, newSupply, collateral, closeFee);

  // Close position
  await supabaseAdmin
    .from("startup_positions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      close_price: exitPrice,
    })
    .eq("id", positionId);

  // Record PnL transaction
  await supabaseAdmin.from("startup_transactions").insert({
    user_id: userId,
    type: "pnl_settlement",
    amount_usdc: pnl,
    description: `Closed ${position.direction} position ${positionId}. PnL: ${pnl.toFixed(6)} USDC`,
  });

  // Record close fee
  await supabaseAdmin.from("startup_transactions").insert({
    user_id: userId,
    type: "fee",
    amount_usdc: closeFee,
    description: `Closed ${position.direction} position ${positionId}. Fee: ${closeFee.toFixed(6)} USDC`,
  });

  return {
    position_id: positionId,
    direction: position.direction,
    entry_price: entryPrice,
    exit_price: exitPrice,
    pnl,
    current_price: newPrice,
    available_usdc: newAvailable,
    locked_usdc: Math.max(0, newLocked),
  };
}

// ── Helpers ─────────────────────────────────────────────────

async function updateBalance(
  userId: string,
  available: number,
  locked: number
) {
  const { error } = await supabaseAdmin
    .from("balances")
    .update({ available_usdc: available, locked_usdc: locked })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to update balance: ${error.message}`);
}

async function updateMarket(
  marketId: string,
  newPrice: number,
  newSupply: number,
  tradeVolume: number,
  fee: number
) {
  // Fetch current market state for fee accumulation and graduation check
  const { data: market } = await supabaseAdmin
    .from("startup_markets")
    .select("volume_24h, fees_accumulated, graduated_at")
    .eq("id", marketId)
    .single();

  const currentVolume = market ? Number(market.volume_24h) : 0;
  const currentFees = market ? Number(market.fees_accumulated) : 0;
  const marketCap = newPrice * newSupply;
  const shouldGraduate =
    marketCap >= GRADUATION_THRESHOLD_USD && !market?.graduated_at;

  const { error } = await supabaseAdmin
    .from("startup_markets")
    .update({
      current_price: newPrice,
      total_supply: newSupply,
      volume_24h: currentVolume + tradeVolume,
      fees_accumulated: currentFees + fee,
      ...(shouldGraduate ? { graduated_at: new Date().toISOString() } : {}),
    })
    .eq("id", marketId);

  if (error) throw new Error(`Failed to update market: ${error.message}`);

  // Record a price snapshot on every trade
  await supabaseAdmin.from("startup_price_snapshots").insert({
    market_id: marketId,
    price: newPrice,
  });
}
