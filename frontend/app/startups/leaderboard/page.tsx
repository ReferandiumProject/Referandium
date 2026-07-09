"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LeaderboardEntry = {
  id: string;
  startup_id: string | null;
  name: string;
  slug: string | null;
  logo_url: string | null;
  stage: string | null;
  description: string | null;
  current_price: number;
  total_supply: number;
  market_cap: number;
  volume_24h: number;
  graduated_at: string | null;
  long_ratio: number;
  short_ratio: number;
  long_count: number;
  short_count: number;
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

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1
      ? "bg-[#F59E0B] text-white"
      : rank === 2
        ? "bg-[#9CA3AF] text-white"
        : rank === 3
          ? "bg-[#B45309] text-white"
          : "border border-[#E5E5E5] bg-white text-[#6B6B6B]";
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold ${colors}`}
    >
      #{rank}
    </div>
  );
}

function RatioBar({ long, short, hasPositions, marketSlug }: { long: number; short: number; hasPositions: boolean; marketSlug: string }) {
  const longPct = Math.round(long * 100);
  const shortPct = Math.round(short * 100);
  return (
    <div className="w-full">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface">
        {hasPositions ? (
          <>
            <div className="h-full bg-long" style={{ width: `${longPct}%` }} />
            <div className="h-full bg-short" style={{ width: `${shortPct}%` }} />
          </>
        ) : (
          <div className="h-full w-full bg-line" />
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        {hasPositions ? (
          <>
            <span className="text-long">Long {longPct}%</span>
            <span className="text-short">Short {shortPct}%</span>
          </>
        ) : (
          <Link
            href={`/market/${marketSlug}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-full bg-startup px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-startup-dark"
          >
            Trade
          </Link>
        )}
      </div>
    </div>
  );
}

export default function StartupLeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/startup-leaderboard")
      .then((r) => r.json())
      .then((json) => setEntries(json.data ?? []))
      .catch(() => setEntries([]));
  }, []);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Leaderboard</h1>
          <p className="mt-2 text-muted">Startup markets ranked by market cap.</p>
        </div>
      </div>
      <div className="mt-6 h-px w-full bg-line" />

      {entries === null ? (
        <p className="mt-12 text-center text-muted">Loading leaderboard...</p>
      ) : entries.length === 0 ? (
        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <h3 className="text-xl font-semibold text-ink">No markets yet</h3>
          <p className="mx-auto mt-3 max-w-sm text-muted">
            Launch the first market and climb to the top of the leaderboard.
          </p>
          <Link
            href="/startups/list"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-startup px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:bg-startup-dark"
          >
            List Your Startup
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-4">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              onClick={() => router.push(`/startups/market/${entry.slug ?? entry.id}`)}
              className="group flex cursor-pointer flex-col gap-4 rounded-lg border border-[#E5E5E5] bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md sm:flex-row sm:items-center"
            >
              <RankBadge rank={index + 1} />

              <div className="flex flex-1 items-center gap-4">
                {entry.logo_url ? (
                  <img
                    src={entry.logo_url}
                    alt={entry.name}
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-startup text-sm font-bold text-white">
                    {initials(entry.name)}
                  </div>
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-ink">{entry.name}</h3>
                    {entry.graduated_at && (
                      <span className="rounded-full border border-startup bg-startup/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-startup">
                        Graduated
                      </span>
                    )}
                    {entry.stage && (
                      <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#6B6B6B]">
                        {entry.stage}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted">
                    {entry.description || "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase tracking-wide text-[#6B6B6B]">Market Cap</p>
                  <p className="text-lg font-semibold text-[#0A0A0A]">{formatCurrency(entry.market_cap)}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase tracking-wide text-[#6B6B6B]">Price</p>
                  <p className="text-lg font-semibold text-[#0A0A0A]">{formatCurrency(entry.current_price)}</p>
                </div>
                <div className="col-span-2 sm:w-40">
                  <RatioBar
                    long={entry.long_ratio}
                    short={entry.short_ratio}
                    hasPositions={entry.long_count + entry.short_count > 0}
                    marketSlug={entry.slug ?? entry.id}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
