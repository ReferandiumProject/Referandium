'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import MarketCard from '../components/MarketCard'
import { Market } from '../types'

const categories = ['All', 'Politics', 'Sports', 'Crypto', 'Pop Culture', 'Business', 'Other']

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  useEffect(() => {
    async function fetchMarkets() {
      try {
        const { data, error } = await supabase
          .from('markets')
          .select('*, options:market_options(*)')
          .order('created_at', { ascending: false })
        if (error) throw error
        setMarkets((data as Market[]) || [])
      } catch (error) {
        console.error('Error fetching markets:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchMarkets()
  }, [])

  const filteredMarkets = markets.filter(market => {
    const matchesSearch =
      (market.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (market.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'All' || market.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="bg-[#faf8ff] text-[#191b23] antialiased min-h-screen">
      <main className="w-full max-w-[1280px] mx-auto px-6 py-6 pb-24 md:pb-10">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
          <h1 className="font-semibold text-[36px] leading-[1.1] tracking-[-0.04em] text-[#191b23]">Markets</h1>
          <Link href="/create" className="bg-[#2563eb] text-white text-[12px] font-semibold tracking-[0.05em] px-4 py-2 rounded-xl hover:bg-[#004ac6] transition-colors flex items-center justify-center gap-2 no-underline">
            + Create Market
          </Link>
        </div>

        {/* Search & Filters Bar */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* Search Input */}
          <div className="relative w-full lg:max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#e1e2ed] rounded-xl pl-10 pr-3 py-2 text-[15px] leading-[1.5] tracking-[-0.01em] text-[#191b23] placeholder:text-[#737686] focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 lg:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-4 py-2 rounded-full border text-[13px] leading-[1.5] font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'border-[#e1e2ed] bg-[#e7e7f3] text-[#191b23]'
                    : 'border-[#e1e2ed] bg-white text-[#434655] hover:bg-[#e7e7f3] hover:text-[#191b23]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-[#737686] text-[13px]">Loading markets...</p>
          </div>
        ) : filteredMarkets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 border border-dashed border-[#e1e2ed] rounded-xl">
            <p className="text-[#191b23] font-semibold text-[15px]">No markets found{selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}</p>
            <p className="text-[#737686] text-[13px] mt-1">
              {searchTerm ? 'Try adjusting your search terms.' : 'Check back later or create the first one.'}
            </p>
          </div>
        )}

      </main>
    </div>
  )
}