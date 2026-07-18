'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { Market, MarketOption } from '../types'

type MarketWithOptions = Market & { options?: MarketOption[] | null }

function formatEndDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function MarketCard({ market }: { market: MarketWithOptions }) {
  const category = market.category || 'General'
  const endDate = formatEndDate(market.end_time)

  // LMSR pricing is not implemented yet; show static placeholder odds.
  const yesPrice = 0.5
  const noPrice = 0.5

  return (
    <Link
      href={`/market/${market.id}`}
      className="group flex h-full flex-col rounded-xl border border-[#2A2A2A] bg-[#161616] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#3B82F6]/50"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded bg-[#3B82F6]/10 px-2 py-0.5 text-xs font-semibold text-[#3B82F6]">
          {category}
        </span>
        <span className="inline-flex rounded bg-[#10B981]/10 px-2 py-0.5 text-xs font-semibold text-[#10B981]">
          Active
        </span>
      </div>

      <h3 className="mb-4 text-[15px] font-semibold leading-snug text-white line-clamp-2">
        {market.title}
      </h3>

      <div className="mb-4 rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[#10B981]">YES ${yesPrice.toFixed(2)}</span>
          <span className="text-[#9CA3AF]">—</span>
          <span className="font-semibold text-[#EF4444]">NO ${noPrice.toFixed(2)}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#2A2A2A]">
          <div className="flex h-full">
            <div className="h-full w-1/2 bg-[#10B981]" />
            <div className="h-full w-1/2 bg-[#EF4444]" />
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[#2A2A2A] pt-4 text-xs text-[#9CA3AF]">
        <span>${Number(market.total_usdc_locked || 0).toLocaleString()} Vol</span>
        <span>Ends {endDate}</span>
      </div>
    </Link>
  )
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<MarketWithOptions[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  useEffect(() => {
    async function fetchMarkets() {
      try {
        const { data, error } = await supabase
          .from('markets')
          .select('*, options:market_options(*)')
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        if (error) throw error
        setMarkets((data as MarketWithOptions[]) || [])
      } catch (error) {
        console.error('[MarketsPage] error fetching markets:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMarkets()
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const market of markets) {
      if (market.category) set.add(market.category)
    }
    return ['All', ...Array.from(set).sort()]
  }, [markets])

  const filteredMarkets = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    return markets.filter((market) => {
      const matchesSearch =
        !term ||
        (market.title || '').toLowerCase().includes(term) ||
        (market.description || '').toLowerCase().includes(term)
      const matchesCategory = selectedCategory === 'All' || market.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [markets, searchTerm, selectedCategory])

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 pb-24 pt-8">
      <main className="mx-auto max-w-[1280px]">
        {/* Header */}
        <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Markets</h1>
            <p className="mt-1 text-sm text-[#9CA3AF]">Active prediction markets on Solana</p>
          </div>
          <Link
            href="/create"
            className="inline-flex items-center justify-center rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
          >
            + Create Market
          </Link>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-md">
            <svg
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-[#2A2A2A] bg-[#161616] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#3B82F6] text-white'
                    : 'border border-[#2A2A2A] bg-[#161616] text-[#9CA3AF] hover:border-[#3B82F6]/30 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-xl border border-[#2A2A2A] bg-[#161616]"
              />
            ))}
          </div>
        ) : filteredMarkets.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#161616] py-20 text-center">
            <p className="text-lg font-medium text-white">No active markets yet</p>
            <p className="mt-2 text-sm text-[#9CA3AF]">
              {searchTerm || selectedCategory !== 'All'
                ? 'Try adjusting your search or category filter.'
                : 'Check back soon for new prediction markets.'}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
