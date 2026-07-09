"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Market = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  current_price: number;
  volume_24h: number;
  price_change_24h: number | null;
  graduated_at: string | null;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MarketCard({ market }: { market: Market }) {
  const change = market.price_change_24h;
  const positive = change !== null && change >= 0;
  return (
    <Link
      href={`/startups/market/${market.id}`}
      className="card group transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(10,10,10,0.10)]"
    >
      <div className="flex items-center gap-3">
        {market.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={market.logo_url}
            alt={market.name}
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface text-sm font-semibold text-muted">
            {initials(market.name)}
          </div>
        )}
        <h3 className="text-[1.05rem] font-semibold text-ink">{market.name}</h3>
        {market.graduated_at && (
          <span className="rounded-full border border-long bg-long/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-long">
            Graduated
          </span>
        )}
      </div>

      {market.description && (
        <p className="mt-1 line-clamp-2 text-sm" style={{ color: '#6B6B6B' }}>
          {market.description}
        </p>
      )}

      <div className="mt-5 flex items-end justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide text-muted">Price</span>
          <p className="mt-0.5 text-xl font-semibold text-ink">${market.current_price.toFixed(4)}</p>
        </div>
        <span
          className="text-sm font-semibold"
          style={{
            color: change === null ? '#6B6B6B' : positive ? '#16A34A' : '#DC2626',
          }}
        >
          {change === null
            ? "—"
            : `${positive ? "+" : ""}${change.toFixed(2)}%`}
        </span>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <span className="text-xs uppercase tracking-wide text-muted">24h Volume</span>
        <p className="mt-0.5 text-sm font-medium text-ink">${market.volume_24h.toFixed(2)}</p>
      </div>
    </Link>
  );
}

export default function StartupsPage() {
  const [markets, setMarkets] = useState<Market[] | null>(null);

  useEffect(() => {
    fetch("/api/startup-markets")
      .then((r) => r.json())
      .then((json) => setMarkets(json.data ?? []))
      .catch(() => setMarkets([]));
  }, []);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Startup Markets</h1>
          <p className="mt-2 text-muted">Live sentiment markets measuring belief in startups.</p>
        </div>
      </div>
      <div className="mt-6 h-px w-full bg-line" />

      {markets === null ? (
        <p className="mt-12 text-center text-muted">Loading markets...</p>
      ) : markets.length === 0 ? (
        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <h3 className="text-xl font-semibold text-ink">No markets yet</h3>
          <p className="mx-auto mt-3 max-w-sm text-muted">
            Be the first to launch your market and start collecting real sentiment signals.
          </p>
          <Link
            href="/startups/list"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            List Your Startup
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </main>
  );
}
