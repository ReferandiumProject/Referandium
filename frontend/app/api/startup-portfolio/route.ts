import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { isAdmin } from "@/lib/admin";

export async function GET(request: NextRequest) {
  try {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const userIsAdmin = isAdmin(user.email);

    // Balance
    const { data: balance, error: balanceError } = await supabaseAdmin
      .from("balances")
      .select("available_usdc, locked_usdc")
      .eq("user_id", user.id)
      .single();

    if (balanceError && balanceError.code !== "PGRST116") {
      console.error("[api/startup-portfolio] balance query failed:", balanceError);
    }

    const availableUsdc = balance ? Number(balance.available_usdc) : 0;
    const lockedUsdc = balance ? Number(balance.locked_usdc) : 0;

    // Open positions with market + startup info
    const { data: rawPositions, error: positionsError } = await supabaseAdmin
      .from("startup_positions")
      .select(
        "id, direction, collateral_usdc, size_tokens, entry_price, opened_at, market_id, markets:startup_markets(current_price, startups:startup_startups(name, slug))"
      )
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (positionsError) {
      console.error("[api/startup-portfolio] positions query failed:", positionsError);
    }

    let totalUnrealisedPnl = 0;

    const positions = (rawPositions ?? []).map((p) => {
      const market = p.markets as unknown as {
        current_price: number;
        startups: { name: string; slug: string | null } | null;
      } | null;
      const currentPrice = market ? Number(market.current_price) : 0;
      const entryPrice = Number(p.entry_price);
      const sizeTokens = Number(p.size_tokens);

      const unrealisedPnl =
        p.direction === "long"
          ? (currentPrice - entryPrice) * sizeTokens
          : (entryPrice - currentPrice) * sizeTokens;

      totalUnrealisedPnl += unrealisedPnl;

      return {
        id: p.id,
        market_id: p.market_id,
        startup_name: market?.startups?.name ?? "Unknown",
        startup_slug: market?.startups?.slug ?? p.market_id,
        direction: p.direction,
        collateral_usdc: Number(p.collateral_usdc),
        entry_price: entryPrice,
        current_price: currentPrice,
        unrealised_pnl: unrealisedPnl,
        opened_at: p.opened_at,
      };
    });

    // Transaction history (most recent first)
    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from("startup_transactions")
      .select("id, type, amount_usdc, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (transactionsError) {
      console.error("[api/startup-portfolio] transactions query failed:", transactionsError);
    }

    // Startups owned by the user, or all startups for admins
    const startupsQuery = supabaseAdmin
      .from("startup_startups")
      .select("id, name, description, pitch, website, twitter, stage, created_at")
      .order("created_at", { ascending: false });

    if (!userIsAdmin) {
      startupsQuery.eq("user_id", user.id);
    }

    const { data: rawStartups, error: startupsError } = await startupsQuery;

    if (startupsError) {
      console.error("[api/startup-portfolio] startups query failed:", startupsError);
      return NextResponse.json(
        { data: null, error: `Startups query failed: ${startupsError.message}` },
        { status: 500 }
      );
    }

    // Fetch markets for the startups in a separate query (avoids nested-select issues)
    const startupIds = (rawStartups ?? []).map((s) => s.id);
    let marketsByStartupId: Record<
      string,
      {
        id: string;
        current_price: number;
        total_supply: number;
        volume_24h: number;
        graduated_at: string | null;
        fees_claimed_at: string | null;
        fees_accumulated: number;
      }
    > = {};

    if (startupIds.length > 0) {
      const { data: rawMarkets, error: marketsError } = await supabaseAdmin
        .from("startup_markets")
        .select("id, startup_id, current_price, total_supply, volume_24h, graduated_at, fees_claimed_at, fees_accumulated")
        .in("startup_id", startupIds);

      if (marketsError) {
        console.error("[api/startup-portfolio] markets query failed:", marketsError);
        return NextResponse.json(
          { data: null, error: `Markets query failed: ${marketsError.message}` },
          { status: 500 }
        );
      }

      marketsByStartupId = (rawMarkets ?? []).reduce((acc, m) => {
        acc[m.startup_id] = {
          id: m.id,
          current_price: Number(m.current_price),
          total_supply: Number(m.total_supply),
          volume_24h: Number(m.volume_24h),
          graduated_at: m.graduated_at ?? null,
          fees_claimed_at: m.fees_claimed_at ?? null,
          fees_accumulated: Number(m.fees_accumulated ?? 0),
        };
        return acc;
      }, {} as typeof marketsByStartupId);
    }

    const startups = (rawStartups ?? []).map((s) => {
      const market = marketsByStartupId[s.id];
      const currentPrice = market ? Number(market.current_price) : 0;
      const totalSupply = market ? Number(market.total_supply) : 0;
      const volume24h = market ? Number(market.volume_24h) : 0;

      return {
        id: s.id,
        name: s.name,
        description: s.description,
        pitch: s.pitch ?? null,
        website: s.website ?? null,
        twitter: s.twitter ?? null,
        stage: s.stage ?? null,
        market_id: market?.id ?? null,
        current_price: currentPrice,
        total_supply: totalSupply,
        market_cap: currentPrice * totalSupply,
        volume_24h: volume24h,
        graduated_at: market?.graduated_at ?? null,
        fees_claimed_at: market?.fees_claimed_at ?? null,
        fees_accumulated: market ? Number(market.fees_accumulated) : 0,
      };
    });

    return NextResponse.json({
      data: {
        summary: {
          available_usdc: availableUsdc,
          locked_usdc: lockedUsdc,
          total_unrealised_pnl: totalUnrealisedPnl,
        },
        isAdmin: userIsAdmin,
        startups,
        positions,
        transactions: (transactions ?? []).map((t) => ({
          id: t.id,
          type: t.type,
          amount_usdc: Number(t.amount_usdc),
          description: t.description,
          created_at: t.created_at,
        })),
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
