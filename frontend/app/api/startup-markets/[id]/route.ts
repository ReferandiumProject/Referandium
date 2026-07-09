import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    console.log("[api/startup-markets/[id]] received id param:", rawId);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

    // Identify the current user (optional — positions only shown if logged in)
    let user: { id: string } | null = null;
    try {
      const authTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Auth verification timeout")), 3000);
      });
      user = await Promise.race([getAuthenticatedUser(request), authTimeout]);
    } catch {
      // Not authenticated or auth verification timed out — continue without user (public market data)
    }

    // Market: look up by UUID or by startup slug
    let market: { id: string; current_price: number | string; total_supply: number | string; volume_24h: number | string; created_at: string; graduated_at: string | null; startup_id: string } | null = null;
    let mktError: any = null;

    if (isUuid) {
      const result = await supabaseAdmin
        .from("startup_markets")
        .select("id, current_price, total_supply, volume_24h, created_at, graduated_at, startup_id")
        .eq("id", rawId)
        .single();
      market = result.data;
      mktError = result.error;
    } else {
      const { data: startupBySlug, error: startupSlugError } = await supabaseAdmin
        .from("startup_startups")
        .select("id")
        .eq("slug", rawId)
        .single();

      if (startupSlugError || !startupBySlug) {
        return NextResponse.json({ data: null, error: "Market not found" }, { status: 404 });
      }

      const result = await supabaseAdmin
        .from("startup_markets")
        .select("id, current_price, total_supply, volume_24h, created_at, graduated_at, startup_id")
        .eq("startup_id", startupBySlug.id)
        .single();
      market = result.data;
      mktError = result.error;
    }

    console.log("[api/startup-markets/[id]] Supabase market result:", { market, mktError });

    if (mktError || !market) {
      return NextResponse.json({ data: null, error: "Market not found" }, { status: 404 });
    }

    // Associated startup
    const { data: startup, error: startupError } = await supabaseAdmin
      .from("startup_startups")
      .select("id, slug, name, description, logo_url, pitch, website, twitter, stage, user_id")
      .eq("id", market.startup_id)
      .single();

    if (startupError || !startup) {
      return NextResponse.json({ data: null, error: "Startup not found" }, { status: 404 });
    }

    // Last 100 price snapshots (oldest → newest for charting)
    const { data: snapshots } = await supabaseAdmin
      .from("startup_price_snapshots")
      .select("price, recorded_at")
      .eq("market_id", market.id)
      .order("recorded_at", { ascending: false })
      .limit(100);

    const chart = (snapshots ?? []).slice().reverse();

    // Long/short ratio across all open positions on this market
    const { data: openPositions } = await supabaseAdmin
      .from("startup_positions")
      .select("direction")
      .eq("market_id", market.id)
      .eq("status", "open");

    const totalOpen = openPositions?.length ?? 0;
    const longCount = openPositions?.filter((p) => p.direction === "long").length ?? 0;
    const shortCount = totalOpen - longCount;

    const currentPrice = Number(market.current_price);
    const totalSupply = Number(market.total_supply);

    // User's open positions on this market with current PnL
    let userPositions: unknown[] = [];
    if (user) {
      const { data: positions } = await supabaseAdmin
        .from("startup_positions")
        .select("id, direction, collateral_usdc, size_tokens, entry_price, opened_at")
        .eq("market_id", market.id)
        .eq("user_id", user.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false });

      userPositions = (positions ?? []).map((p) => {
        const entryPrice = Number(p.entry_price);
        const sizeTokens = Number(p.size_tokens);
        const unrealisedPnl =
          p.direction === "long"
            ? (currentPrice - entryPrice) * sizeTokens
            : (entryPrice - currentPrice) * sizeTokens;
        return {
          id: p.id,
          direction: p.direction,
          collateral_usdc: Number(p.collateral_usdc),
          size_tokens: sizeTokens,
          entry_price: entryPrice,
          current_price: currentPrice,
          unrealised_pnl: unrealisedPnl,
          opened_at: p.opened_at,
        };
      });
    }

    return NextResponse.json({
      data: {
        market: {
          id: market.id,
          current_price: currentPrice,
          total_supply: totalSupply,
          volume_24h: Number(market.volume_24h),
          market_cap: currentPrice * totalSupply,
          created_at: market.created_at,
          graduated_at: market.graduated_at,
          startup,
        },
        chart,
        ratio: {
          total: totalOpen,
          long: longCount,
          short: shortCount,
          long_pct: totalOpen > 0 ? (longCount / totalOpen) * 100 : 50,
          short_pct: totalOpen > 0 ? (shortCount / totalOpen) * 100 : 50,
        },
        positions: userPositions,
        authenticated: !!user,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
