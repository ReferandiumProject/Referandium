"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";

export default function StartupLandingPage() {
  const { authenticated, login } = usePrivy();

  return (
    <main className="bg-white text-[#0A0A0A]">
      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-4 py-24 text-center sm:py-32">
        <span className="inline-flex items-center rounded-full bg-[#CCFBF1] px-3 py-1 text-xs font-semibold text-[#0D9488]">
          Live on Solana Devnet
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          The Market for Startup Belief
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#6B6B6B]">
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

      {/* How it works */}
      <section className="mx-auto max-w-[1200px] px-4 pb-24">
        <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0D9488] text-sm font-bold text-white">
              1
            </div>
            <p className="mt-5 text-base font-semibold text-[#0A0A0A]">Startup lists a token</p>
            <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
              Pay a one-time $200 USDC listing fee to launch your sentiment market.
            </p>
          </div>
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0D9488] text-sm font-bold text-white">
              2
            </div>
            <p className="mt-5 text-base font-semibold text-[#0A0A0A]">Traders go long or short</p>
            <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
              Anyone can buy into or bet against your startup's momentum.
            </p>
          </div>
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0D9488] text-sm font-bold text-white">
              3
            </div>
            <p className="mt-5 text-base font-semibold text-[#0A0A0A]">Price = live crowd sentiment</p>
            <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
              The token price reflects real-time belief in your startup.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-[1200px] px-4 pb-24">
        <div className="rounded-lg bg-[#0D9488] p-8 sm:p-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Ready to list?</h2>
              <p className="mt-2 text-white/90">
                Launch your startup market and start collecting live sentiment.
              </p>
            </div>
            {authenticated ? (
              <Link
                href="/list"
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-6 py-3 text-[15px] font-semibold text-[#0D9488] transition-colors hover:bg-[#F0FFFE]"
              >
                List Your Startup
              </Link>
            ) : (
              <button
                onClick={() => login()}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-6 py-3 text-[15px] font-semibold text-[#0D9488] transition-colors hover:bg-[#F0FFFE]"
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
