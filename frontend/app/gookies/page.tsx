'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { Gookie } from '../types'

interface CreatorCard extends Gookie {
  market_count?: number
}

export default function GookiesPage() {
  const [creators, setCreators] = useState<CreatorCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCreators() {
      try {
        const { data: gookies, error } = await supabase
          .from('gookies')
          .select('*')
          .eq('is_verified', true)
          .order('created_at', { ascending: false })

        if (error) throw error
        if (!gookies || gookies.length === 0) { setCreators([]); setLoading(false); return }

        const wallets = gookies.map(g => g.winner_wallet).filter(Boolean) as string[]
        const uniqueWallets = [...new Set(wallets)]

        let marketCounts: Record<string, number> = {}
        if (uniqueWallets.length > 0) {
          const { data: markets } = await supabase
            .from('markets')
            .select('gookie_wallet')
            .in('gookie_wallet', uniqueWallets)
          if (markets) {
            markets.forEach(m => {
              if (m.gookie_wallet) marketCounts[m.gookie_wallet] = (marketCounts[m.gookie_wallet] || 0) + 1
            })
          }
        }

        setCreators((gookies as Gookie[]).map(g => ({
          ...g,
          market_count: g.winner_wallet ? marketCounts[g.winner_wallet] || 0 : 0,
        })))
      } catch (err) {
        console.error('Error fetching creators:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCreators()
  }, [])

  const shortWallet = (w: string | null | undefined) => {
    if (!w) return '—'
    return `${w.slice(0, 4)}...${w.slice(-4)}`
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Verified Creators</h1>
        <p className="text-slate-500 text-sm mb-8">Trusted market curators verified by Referandium.</p>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-slate-400 text-sm">Loading creators...</p>
          </div>
        ) : creators.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-slate-200 rounded-xl">
            <p className="text-slate-900 font-medium">No verified creators yet</p>
            <p className="text-slate-400 text-sm mt-1">Check back later as the community grows.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {creators.map(creator => (
              <div key={creator.id} className="border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{creator.title}</h3>
                  <span className="text-xs font-medium text-blue-600 shrink-0 ml-2">✓ Verified</span>
                </div>
                {creator.description && (
                  <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{creator.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-3">
                  <span className="font-mono">{shortWallet(creator.winner_wallet)}</span>
                  <span>{creator.market_count} market{creator.market_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
