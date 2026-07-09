import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  try {
    // All markets joined with their startup, sorted by 24h volume desc
    const { data: markets, error } = await supabaseAdmin
      .from("startup_markets")
      .select("id, current_price, total_supply, volume_24h, created_at, graduated_at, startups:startup_startups(name, slug, logo_url, description)")
      .order("volume_24h", { ascending: false });

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const results = await Promise.all(
      (markets ?? []).map(async (m) => {
        const startup = m.startups as unknown as {
          name: string;
          slug: string | null;
          logo_url: string | null;
          description: string | null;
        } | null;
        const currentPrice = Number(m.current_price);

        // Latest snapshot from at least 24h ago → baseline for % change
        const { data: baseline } = await supabaseAdmin
          .from("startup_price_snapshots")
          .select("price")
          .eq("market_id", m.id)
          .lte("recorded_at", since)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const price_change_24h = baseline
          ? ((currentPrice - Number(baseline.price)) / Number(baseline.price)) * 100
          : null;

        return {
          id: m.id,
          name: startup?.name ?? "Unknown",
          slug: startup?.slug ?? null,
          logo_url: startup?.logo_url ?? null,
          description: startup?.description ?? null,
          current_price: currentPrice,
          volume_24h: Number(m.volume_24h),
          price_change_24h,
          graduated_at: m.graduated_at,
        };
      })
    );

    return NextResponse.json({ data: results, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
