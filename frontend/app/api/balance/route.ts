import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    const { data: balance, error } = await supabaseAdmin
      .from("balances")
      .select("available_usdc, locked_usdc")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[api/balance] balance query failed:", error);
      return NextResponse.json(
        { data: null, error: "Failed to fetch balance" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        available_usdc: balance ? Number(balance.available_usdc) : 0,
        locked_usdc: balance ? Number(balance.locked_usdc) : 0,
      },
      error: null,
    });
  } catch {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
}
