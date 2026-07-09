"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";

const DUMMY_MARKETS = [
  { name: "Stripe", short: "STR", price: 0.142, change: 12.3, mcap: 142000 },
  { name: "OpenAI", short: "OAI", price: 0.098, change: -5.1, mcap: 98000 },
  { name: "Notion", short: "NOT", price: 0.071, change: 8.7, mcap: 71000 },
  { name: "Linear", short: "LIN", price: 0.055, change: 2.1, mcap: 55000 },
  { name: "Vercel", short: "VCL", price: 0.089, change: -3.4, mcap: 89000 },
  { name: "Figma", short: "FIG", price: 0.034, change: 18.2, mcap: 34000 },
  { name: "Supabase", short: "SUP", price: 0.061, change: 6.5, mcap: 61000 },
  { name: "Loom", short: "LOO", price: 0.028, change: -9.8, mcap: 28000 },
  { name: "Cursor", short: "CUR", price: 0.113, change: 22.4, mcap: 113000 },
  { name: "Raycast", short: "RAY", price: 0.047, change: -1.2, mcap: 47000 },
];

const BUBBLE_POSITIONS = [
  { x: 140, y: 130 },
  { x: 350, y: 100 },
  { x: 560, y: 140 },
  { x: 720, y: 110 },
  { x: 130, y: 300 },
  { x: 330, y: 310 },
  { x: 510, y: 300 },
  { x: 690, y: 300 },
  { x: 460, y: 190 },
  { x: 260, y: 200 },
];

function BubbleChart() {
  const [hovered, setHovered] = useState<(typeof DUMMY_MARKETS)[0] | null>(null);
  const maxMcap = Math.max(...DUMMY_MARKETS.map((m) => m.mcap));

  return (
    <div className="relative">
      <svg viewBox="0 0 820 420" className="h-auto w-full">
        {DUMMY_MARKETS.map((market, i) => {
          const pos = BUBBLE_POSITIONS[i];
          const r = 28 + (market.mcap / maxMcap) * 42;
          const color = market.change >= 0 ? "#16A34A" : "#DC2626";
          const changeText = `${market.change >= 0 ? "+" : ""}${market.change.toFixed(1)}%`;
          return (
            <g
              key={market.name}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer transition-opacity duration-150 hover:opacity-90"
              onMouseEnter={() => setHovered(market)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={r}
                fill={color}
                fillOpacity={0.12}
                stroke={color}
                strokeWidth={2}
              />
              <text
                textAnchor="middle"
                dy="-0.15em"
                fill={color}
                fontSize={Math.max(14, r * 0.34)}
                fontWeight={600}
              >
                {market.short}
              </text>
              <text
                textAnchor="middle"
                dy="1.35em"
                fill={color}
                fontSize={12}
                fontWeight={500}
              >
                {changeText}
              </text>

              {hovered?.name === market.name && (
                <g transform={`translate(0, ${-r - 14})`}>
                  <rect
                    x="-72"
                    y="-52"
                    width="144"
                    height="50"
                    rx="8"
                    fill="white"
                    stroke="#E5E5E5"
                    strokeWidth={1}
                  />
                  <text
                    textAnchor="middle"
                    y="-34"
                    fill="#0A0A0A"
                    fontSize={13}
                    fontWeight={600}
                  >
                    {market.name}
                  </text>
                  <text
                    textAnchor="middle"
                    y="-16"
                    fill="#6B6B6B"
                    fontSize={12}
                  >
                    ${market.price.toFixed(3)}
                  </text>
                  <text
                    textAnchor="middle"
                    y="2"
                    fill={color}
                    fontSize={12}
                    fontWeight={600}
                  >
                    {changeText}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Ticker() {
  const items = DUMMY_MARKETS.map((m) => {
    const changeText = `${m.change >= 0 ? "+" : ""}${m.change.toFixed(1)}%`;
    return `${m.name.toUpperCase()} ${changeText}`;
  });
  const content = items.join(" · ");

  return (
    <div className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white py-3">
      <div className="ticker-track flex whitespace-nowrap">
        <span className="px-4 text-sm font-medium text-[#0A0A0A]">{content} · </span>
        <span className="px-4 text-sm font-medium text-[#0A0A0A]">{content} · </span>
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

export default function StartupLandingPage() {
  const { authenticated, login } = usePrivy();

  return (
    <main className="bg-white text-[#0A0A0A]">
      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-16 text-center sm:pb-20 sm:pt-24">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          The Market for Startup Belief
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#6B6B6B]">
          Startups list their token. Traders go long or short. Price is live sentiment.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/markets"
            className="inline-flex items-center justify-center rounded-lg bg-startup px-8 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-startup-dark"
          >
            Browse Markets
          </Link>
          {authenticated ? (
            <Link
              href="/list"
              className="inline-flex items-center justify-center rounded-lg border border-[#E5E5E5] bg-white px-8 py-3 text-[15px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#FAFAFA]"
            >
              List Your Startup
            </Link>
          ) : (
            <button
              onClick={() => login()}
              className="inline-flex items-center justify-center rounded-lg border border-[#E5E5E5] bg-white px-8 py-3 text-[15px] font-semibold text-[#0A0A0A] transition-colors hover:bg-[#FAFAFA]"
            >
              List Your Startup
            </button>
          )}
        </div>
      </section>

      {/* Live Markets */}
      <section className="mx-auto max-w-[1200px] px-4 pb-20">
        <div className="flex items-center justify-center gap-3">
          <h2 className="text-center text-2xl font-bold tracking-tight">Live Markets</h2>
          <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
            Demo
          </span>
        </div>
        <div className="mt-10 rounded-lg border border-[#E5E5E5] bg-white p-6 sm:p-10">
          <BubbleChart />
        </div>
        <div className="mt-6">
          <Ticker />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1200px] px-4 pb-20">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-6">
            <p className="text-sm font-semibold text-startup">Step 1</p>
            <p className="mt-2 text-base font-medium text-[#0A0A0A]">
              Startup lists a token ($200 USDC)
            </p>
          </div>
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-6">
            <p className="text-sm font-semibold text-startup">Step 2</p>
            <p className="mt-2 text-base font-medium text-[#0A0A0A]">
              Traders go long or short
            </p>
          </div>
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-6">
            <p className="text-sm font-semibold text-startup">Step 3</p>
            <p className="mt-2 text-base font-medium text-[#0A0A0A]">
              Price = live crowd sentiment
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-[1200px] px-4 pb-20">
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-8 sm:p-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Ready to list?</h2>
              <p className="mt-2 text-[#6B6B6B]">
                Launch your startup market and start collecting live sentiment.
              </p>
            </div>
            {authenticated ? (
              <Link
                href="/list"
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-startup px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-startup-dark"
              >
                List Your Startup
              </Link>
            ) : (
              <button
                onClick={() => login()}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-startup px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-startup-dark"
              >
                List Your Startup
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
