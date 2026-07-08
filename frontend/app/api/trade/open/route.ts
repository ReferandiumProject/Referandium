import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { openPosition } from "@/lib/trading-engine";
import { checkMarketLiquidations } from "@/lib/liquidation";

export async function POST(request: NextRequest) {
  try {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { market_id, direction, collateral_usdc } = body;

    if (!market_id || !direction || !collateral_usdc) {
      return NextResponse.json(
        { error: "Missing required fields: market_id, direction, collateral_usdc" },
        { status: 400 }
      );
    }

    if (direction !== "long" && direction !== "short") {
      return NextResponse.json(
        { error: "Direction must be 'long' or 'short'" },
        { status: 400 }
      );
    }

    if (typeof collateral_usdc !== "number" || collateral_usdc <= 0) {
      return NextResponse.json(
        { error: "collateral_usdc must be a positive number" },
        { status: 400 }
      );
    }

    const result = await openPosition(user.id, market_id, direction, collateral_usdc);

    // Run liquidation checks after price update
    await checkMarketLiquidations(market_id);

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
