"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PriceChart } from "@/app/components/startups/PriceChart";
import { TradingPanel } from "@/app/components/startups/TradingPanel";
import { Spinner } from "@/app/components/ui/Spinner";

type Startup = {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  pitch: string | null;
  website: string | null;
  twitter: string | null;
  stage: string | null;
  user_id: string;
} | null;

function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

type MarketData = {
  market: {
    id: string;
    current_price: number;
    total_supply: number;
    volume_24h: number;
    market_cap: number;
    created_at: string;
    graduated_at: string | null;
    startup: Startup;
  };
  chart: { price: number; recorded_at: string }[];
  ratio: {
    total: number;
    long: number;
    short: number;
    long_pct: number;
    short_pct: number;
  };
  positions: {
    id: string;
    direction: "long" | "short";
    collateral_usdc: number;
    size_tokens: number;
    entry_price: number;
    current_price: number;
    unrealised_pnl: number;
    opened_at: string;
  }[];
  authenticated: boolean;
};

export default function StartupMarketPage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const { getAccessToken } = usePrivy();

  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    console.log("[startup market page] fetching /api/startup-markets/" + slug);
    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/startup-markets/${slug}`, { headers });
      const json = await res.json();
      console.log("[startup market page] API response:", { ok: res.ok, status: res.status, data: json });
      if (!res.ok || !json.data) {
        setNotFound(true);
      } else {
        setData(json.data);
      }
    } catch (error) {
      console.error("[startup market page] fetch error:", error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug, getAccessToken]);

  useEffect(() => {
    if (!slug) return;
    fetchData();
  }, [fetchData, slug]);

  const handleClose = async (positionId: string) => {
    setClosingId(positionId);
    setCloseError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/trade/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ position_id: positionId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setCloseError(json.error || "Failed to close position");
      } else {
        await fetchData();
      }
    } catch {
      setCloseError("Network error while closing position");
    } finally {
      setClosingId(null);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 py-12 text-muted">
        <Spinner /> Loading market...
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-12">
        <h1 className="text-xl font-semibold text-ink">Market not found</h1>
      </main>
    );
  }

  return (
    <MarketContent
      data={data}
      closingId={closingId}
      closeError={closeError}
      onClose={handleClose}
      onTraded={fetchData}
    />
  );
}

function MarketContent({
  data,
  closingId,
  closeError,
  onClose,
  onTraded,
}: {
  data: MarketData;
  closingId: string | null;
  closeError: string | null;
  onClose: (positionId: string) => void;
  onTraded: () => void;
}) {
  const { market, chart, ratio, positions, authenticated } = data;
  const startup = market.startup;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left side */}
        <div className="space-y-8 lg:col-span-2">
          {/* Profile card */}
          <div className="card">
            <div className="flex items-start gap-4">
              {startup?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={startup.logo_url}
                  alt={startup.name}
                  className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-xl font-bold text-muted">
                  {startup?.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-ink">
                    {startup?.name}
                  </h1>
                  {market.graduated_at && (
                    <span className="rounded-full border border-long bg-long/10 px-2.5 py-0.5 text-xs font-medium text-long">
                      Graduated
                    </span>
                  )}
                  {startup?.stage && (
                    <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink">
                      {startup.stage}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{startup?.description}</p>
                {startup?.pitch && (
                  <p className="mt-3 text-sm leading-relaxed text-ink">
                    {startup.pitch}
                  </p>
                )}
                {(startup?.website || startup?.twitter) && (
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {startup.website && (
                      <a
                        href={normalizeUrl(startup.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-ink hover:underline"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20" />
                        </svg>
                        Website
                      </a>
                    )}
                    {startup.twitter && (
                      <a
                        href={
                          startup.twitter.startsWith("http")
                            ? startup.twitter
                            : `https://x.com/${startup.twitter.replace(/^@/, "")}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-ink hover:underline"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        {startup.twitter.startsWith("http") ? "Twitter" : startup.twitter}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card text-center">
              <span className="text-xs text-muted">Current Price</span>
              <p className="mt-1 text-lg font-semibold text-ink">${market.current_price.toFixed(4)}</p>
            </div>
            <div className="card text-center">
              <span className="text-xs text-muted">Market Cap</span>
              <p className="mt-1 text-lg font-semibold text-ink">${market.market_cap.toFixed(2)}</p>
            </div>
            <div className="card text-center">
              <span className="text-xs text-muted">24h Volume</span>
              <p className="mt-1 text-lg font-semibold text-ink">${market.volume_24h.toFixed(2)}</p>
            </div>
          </div>

          {/* Price chart */}
          <PriceChart data={chart} />

          {/* Long/short ratio bar */}
          <div className="card">
            <div className="flex justify-between text-xs text-muted">
              <span>Long {ratio.long_pct.toFixed(0)}%</span>
              <span>Short {ratio.short_pct.toFixed(0)}%</span>
            </div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-surface">
              <div className="bg-long" style={{ width: `${ratio.long_pct}%` }} />
              <div className="bg-short" style={{ width: `${ratio.short_pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{ratio.total} open positions</p>
          </div>

          {/* User's open positions */}
          {authenticated && (
            <div className="card !p-0">
              <h2 className="border-b border-line px-6 py-4 text-sm font-semibold text-ink">
                Your Open Positions
              </h2>
              {closeError && (
                <p className="px-6 py-3 text-sm text-short">{closeError}</p>
              )}
              {positions.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted">No open positions</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="px-6 py-2 font-medium">Direction</th>
                        <th className="px-6 py-2 font-medium">Collateral</th>
                        <th className="px-6 py-2 font-medium">Entry</th>
                        <th className="px-6 py-2 font-medium">Current</th>
                        <th className="px-6 py-2 font-medium">PnL</th>
                        <th className="px-6 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={p.id} className="border-t border-line">
                          <td className="px-6 py-3">
                            <span
                              className={`text-xs font-medium ${
                                p.direction === "long" ? "text-long" : "text-short"
                              }`}
                            >
                              {p.direction === "long" ? "Long" : "Short"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-ink">${p.collateral_usdc.toFixed(2)}</td>
                          <td className="px-6 py-3 text-ink">${p.entry_price.toFixed(4)}</td>
                          <td className="px-6 py-3 text-ink">${p.current_price.toFixed(4)}</td>
                          <td
                            className={`px-6 py-3 font-medium ${
                              p.unrealised_pnl >= 0 ? "text-long" : "text-short"
                            }`}
                          >
                            {p.unrealised_pnl >= 0 ? "+" : ""}
                            ${p.unrealised_pnl.toFixed(2)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              onClick={() => onClose(p.id)}
                              disabled={closingId === p.id}
                              className="btn btn-destructive px-3 py-1 text-xs"
                            >
                              {closingId === p.id && <Spinner />}
                              {closingId === p.id ? "Closing..." : "Close"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side — trading panel */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-8">
            <TradingPanel
              marketId={market.id}
              totalSupply={market.total_supply}
              authenticated={authenticated}
              onTraded={onTraded}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
