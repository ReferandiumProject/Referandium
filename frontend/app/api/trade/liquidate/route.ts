import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { checkLiquidations } from "@/lib/liquidation";

export async function POST(request: NextRequest) {
  try {
    try {
      await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { market_id } = body as { market_id?: string };

    const result = await checkLiquidations(market_id);

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
