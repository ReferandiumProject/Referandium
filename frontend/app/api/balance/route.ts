import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { backfillInvestmentPacks } from "@/lib/backfill-investment-packs";
import { scanAndSweepUserDeposits } from "@/lib/scan-user-deposits";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    try {
      await backfillInvestmentPacks(user.id)
    } catch (err: any) {
      console.error('[api/balance] backfillInvestmentPacks error:', err?.message ?? err)
    }

    try {
      await scanAndSweepUserDeposits(user.id)
    } catch (err: any) {
      console.error('[api/balance] scanAndSweepUserDeposits error:', err?.message ?? err)
    }

    const { data: releaseData, error: releaseError } = await supabaseAdmin.rpc(
      'release_due_investment_packs',
      { p_user_id: user.id }
    );

    if (releaseError) {
      console.error('[api/balance] release_due_investment_packs error:', releaseError);
    }

    const release = Array.isArray(releaseData) ? releaseData[0] : releaseData;

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
        released: {
          count: release ? Number(release.r_released_count ?? 0) : 0,
          usdc: release ? Number(release.r_released_usdc ?? 0) : 0,
        },
      },
      error: null,
    });
  } catch {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }
}
