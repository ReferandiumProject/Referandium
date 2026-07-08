import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { closePosition } from "@/lib/trading-engine";
import { checkMarketLiquidations } from "@/lib/liquidation";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { position_id } = body;

    if (!position_id) {
      return NextResponse.json(
        { error: "Missing required field: position_id" },
        { status: 400 }
      );
    }

    // Get position market_id for liquidation check
    const { data: position } = await supabaseAdmin
      .from("startup_positions")
      .select("market_id")
      .eq("id", position_id)
      .eq("user_id", user.id)
      .single();

    const result = await closePosition(user.id, position_id);

    // Run liquidation checks on the affected market
    if (position?.market_id) {
      await checkMarketLiquidations(position.market_id);
    }

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
