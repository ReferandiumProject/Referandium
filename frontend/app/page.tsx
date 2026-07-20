'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { Market } from './types'

type Stats = {
  volume: number
  markets: number
  users: number
}

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let raf = 0
    const start = performance.now()

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setValue(Math.floor(target * progress))
      if (progress < 1) {
        raf = requestAnimationFrame(animate)
      }
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}

function StatCard({ label, value, prefix = '' }: { label: string; value: number; prefix?: string }) {
  const animated = useCountUp(value)
  const formatted = prefix + animated.toLocaleString()

  return (
    <div className="text-center">
      <p className="text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">{formatted}</p>
      <p className="mt-1 text-sm text-[#6B7280]">{label}</p>
    </div>
  )
}

export default function Home() {
  const { authenticated, login } = usePrivy()
  const [stats, setStats] = useState<Stats>({ volume: 0, markets: 0, users: 0 })
  const [markets, setMarkets] = useState<Market[]>([])
  const [marketSignals, setMarketSignals] = useState<Record<string, { yes: number; no: number }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [marketsRes, statsRes] = await Promise.all([
          fetch('/api/markets'),
          fetch('/api/stats'),
        ])

        if (!marketsRes.ok || !statsRes.ok) {
          throw new Error(`Failed to fetch home data (${marketsRes.status}, ${statsRes.status})`)
        }

        const { markets: activeMarkets } = await marketsRes.json() as { markets: Market[] | null }
        const { volume, activeMarkets: marketCount, traders } = await statsRes.json() as { volume: number; activeMarkets: number; traders: number }

        setMarkets(activeMarkets || [])

        const signalsMap: Record<string, { yes: number; no: number }> = {}
        for (const market of activeMarkets || []) {
          const yes = market.options?.reduce((sum, option) => sum + Number(option.yes_signals || 0), 0) || 0
          const no = market.options?.reduce((sum, option) => sum + Number(option.no_signals || 0), 0) || 0
          signalsMap[market.id] = { yes, no }
        }
        setMarketSignals(signalsMap)

        setStats({
          volume,
          markets: marketCount || 0,
          users: traders || 0,
        })
      } catch (error) {
        console.error('[Home] error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero */}
      <section className="px-4 pb-16 pt-24 sm:pb-24 sm:pt-32">
        <div className="mx-auto max-w-[1200px] text-center">
          <span className="mb-6 inline-flex items-center rounded-full bg-[#3B82F6]/10 px-3 py-1 text-xs font-semibold text-[#3B82F6]">
            USDC Prediction Markets on Solana
          </span>
          <h1 className="mb-6 text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl md:text-5xl lg:text-6xl">
            Trade on what happens next.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl px-2 text-base leading-relaxed text-[#6B7280] sm:px-0 sm:text-lg">
            Referandium is a Polymarket-style prediction market where you bet USDC on real-world outcomes.
            Yes or no. Trade now, settle later.
          </p>
          <div className="flex w-full flex-col items-stretch justify-center gap-3 px-4 sm:w-auto sm:flex-row sm:items-center sm:gap-4 sm:px-0">
            <Link
              href="/markets"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#3B82F6] px-8 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#2563EB] sm:w-auto"
            >
              Browse Markets
            </Link>
            {authenticated ? (
              <Link
                href="/create"
                className="inline-flex w-full items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-8 py-3 text-[15px] font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB] sm:w-auto"
              >
                Create a Market
              </Link>
            ) : (
              <button
                onClick={() => login()}
                className="inline-flex w-full items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-8 py-3 text-[15px] font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB] sm:w-auto"
              >
                Sign Up
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Live stats */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <div className="grid grid-cols-1 gap-8 rounded-2xl border border-[#E5E7EB] bg-white p-8 sm:grid-cols-3">
              <StatCard label="Total Volume Traded" value={stats.volume} prefix="$" />
              <StatCard label="Open Markets" value={stats.markets} />
              <StatCard label="Traders" value={stats.users} />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Featured markets */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-tight text-[#111827]">Featured Markets</h2>
              <Link
                href="/markets"
                className="text-sm font-semibold text-[#3B82F6] transition-colors hover:text-[#2563EB]"
              >
                View all
              </Link>
            </div>
          </FadeIn>

          {loading ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-48 animate-pulse rounded-xl border border-[#E5E7EB] bg-[#F3F4F6]"
                />
              ))}
            </div>
          ) : markets.length === 0 ? (
            <FadeIn>
              <div className="rounded-2xl border border-[#E5E7EB] bg-white py-16 text-center">
                <p className="text-lg font-medium text-[#111827]">No live markets yet</p>
                <p className="mt-2 text-sm text-[#6B7280]">Check back soon for new prediction markets.</p>
              </div>
            </FadeIn>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {markets.map((market) => (
                <MarketCard key={market.id} market={market} signals={marketSignals[market.id]} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-[#111827]">
              How it works
            </h2>
          </FadeIn>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                title: 'Deposit USDC',
                desc: 'Fund your account with USDC on Solana. Your balance is ready to trade in seconds.',
              },
              {
                title: 'Bet YES or NO',
                desc: 'Pick an active market and buy shares for the outcome you believe will happen.',
              },
              {
                title: 'Get paid when it resolves',
                desc: 'When the market settles, winning positions are paid out in USDC automatically.',
              },
            ].map((step, index) => (
              <FadeIn key={step.title}>
                <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#3B82F6]/30">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#3B82F6] text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-[#111827]">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-[#6B7280]">{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <div className="rounded-2xl bg-[#3B82F6] p-8 text-center sm:p-12">
              <h2 className="mb-3 text-xl font-bold text-white sm:text-2xl md:text-3xl">
                Ready to start trading?
              </h2>
              <p className="mx-auto mb-8 max-w-xl px-2 text-sm text-white/80 sm:text-base sm:px-0">
                Join the market and put your convictions to the test. New prediction markets are added every week.
              </p>
              <Link
                href="/markets"
                className="inline-flex w-full items-center justify-center rounded-lg bg-white px-8 py-3 text-[15px] font-semibold text-[#3B82F6] transition-colors hover:bg-[#F0F9FF] sm:w-auto"
              >
                Browse Markets
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  )
}

function MarketCard({
  market,
  signals,
}: {
  market: Market
  signals?: { yes: number; no: number }
}) {
  const total = (signals?.yes || 0) + (signals?.no || 0)
  const yesPct = total > 0 ? Math.round(((signals?.yes || 0) / total) * 100) : 0
  const noPct = total > 0 ? 100 - yesPct : 0
  const endDate = new Date(market.end_time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Link
      href={`/market/${market.id}`}
      className="group block rounded-xl border border-[#E5E7EB] bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#3B82F6]/50"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded bg-[#3B82F6]/10 px-2 py-0.5 text-xs font-semibold text-[#3B82F6]">
          {market.category || 'General'}
        </span>
        <span className="inline-flex rounded bg-[#10B981]/10 px-2 py-0.5 text-xs font-semibold text-[#10B981]">
          Active
        </span>
      </div>

      <h3 className="mb-4 text-[15px] font-semibold leading-snug text-[#111827] line-clamp-2">
        {market.title}
      </h3>

      {total > 0 ? (
        <div className="mb-4">
          <div className="mb-2 flex justify-between text-xs font-medium">
            <span className="text-[#10B981]">YES {yesPct}%</span>
            <span className="text-[#EF4444]">NO {noPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <div className="flex h-full">
              <div className="h-full bg-[#10B981]" style={{ width: `${yesPct}%` }} />
              <div className="h-full bg-[#EF4444]" style={{ width: `${noPct}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-xs text-[#6B7280]">No signals yet</p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-[#E5E7EB] pt-4 text-xs text-[#6B7280]">
        <span>${Number(market.total_usdc_locked || 0).toLocaleString()} Vol</span>
        <span>Ends {endDate}</span>
      </div>
    </Link>
  )
}
