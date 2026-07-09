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

  const badgeClasses =
    change === null
      ? "rounded-full bg-[#F3F4F6] px-2 py-0.5 text-xs font-semibold text-[#6B6B6B]"
      : positive
        ? "rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#16A34A]"
        : "rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-semibold text-[#DC2626]";

  const changeText =
    change === null ? "—" : `${positive ? "+" : ""}${change.toFixed(2)}%`;

  return (
    <Link
      href={`/startups/market/${market.id}`}
      className="group flex flex-col cursor-pointer rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
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
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-startup text-sm font-bold text-white">
            {initials(market.name)}
          </div>
        )}
        <h3 className="text-[1.05rem] font-semibold text-[#0A0A0A]">{market.name}</h3>
        {market.graduated_at && (
          <span className="rounded-full border border-long bg-long/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-long">
            Graduated
          </span>
        )}
      </div>

      {market.description && (
        <p className="mt-2 line-clamp-2 text-sm text-[#6B6B6B]">
          {market.description}
        </p>
      )}

      <div className="my-4 h-px w-full bg-[#E5E5E5]" />

      <div className="flex items-center justify-between">
        <p className="text-xl font-bold text-[#0A0A0A]">
          ${market.current_price.toFixed(4)}
        </p>
        <span className={badgeClasses}>{changeText}</span>
      </div>

      <p className="mt-2 text-xs text-[#6B6B6B]">
        Vol ${market.volume_24h.toFixed(2)}
      </p>
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
