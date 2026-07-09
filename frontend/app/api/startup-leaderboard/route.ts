import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const { data: markets, error: marketsError } = await supabaseAdmin
      .from("startup_markets")
      .select(
        "id, current_price, total_supply, volume_24h, graduated_at, startups:startup_startups(id, name, slug, logo_url, stage, description)"
      )
      .order("current_price", { ascending: false });

    if (marketsError) {
      return NextResponse.json({ data: null, error: marketsError.message }, { status: 500 });
    }

    const marketIds = (markets ?? []).map((m) => m.id);

    let positionCounts: Record<string, { long: number; short: number }> = {};
    if (marketIds.length > 0) {
      const { data: positions, error: positionsError } = await supabaseAdmin
        .from("startup_positions")
        .select("market_id, direction")
        .eq("status", "open")
        .in("market_id", marketIds);

      if (positionsError) {
        console.error("[api/startup-leaderboard] positions query failed:", positionsError);
      } else {
        positionCounts = (positions ?? []).reduce((acc, p) => {
          if (!acc[p.market_id]) {
            acc[p.market_id] = { long: 0, short: 0 };
          }
          acc[p.market_id][p.direction as "long" | "short"] += 1;
          return acc;
        }, {} as Record<string, { long: number; short: number }>);
      }
    }

    const results = (markets ?? []).map((m) => {
      const startup = m.startups as unknown as {
        id: string;
        name: string;
        slug: string | null;
        logo_url: string | null;
        stage: string | null;
        description: string | null;
      } | null;
      const currentPrice = Number(m.current_price);
      const totalSupply = Number(m.total_supply);
      const marketCap = currentPrice * totalSupply;
      const counts = positionCounts[m.id] ?? { long: 0, short: 0 };
      const totalPositions = counts.long + counts.short;
      const longRatio = totalPositions > 0 ? counts.long / totalPositions : 0.5;
      const shortRatio = totalPositions > 0 ? counts.short / totalPositions : 0.5;

      return {
        id: m.id,
        startup_id: startup?.id ?? null,
        name: startup?.name ?? "Unknown",
        slug: startup?.slug ?? null,
        logo_url: startup?.logo_url ?? null,
        stage: startup?.stage ?? null,
        description: startup?.description ?? null,
        current_price: currentPrice,
        total_supply: totalSupply,
        market_cap: marketCap,
        volume_24h: Number(m.volume_24h),
        graduated_at: m.graduated_at,
        long_ratio: longRatio,
        short_ratio: shortRatio,
        long_count: counts.long,
        short_count: counts.short,
      };
    });

    results.sort((a, b) => b.market_cap - a.market_cap);

    return NextResponse.json({ data: results, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
