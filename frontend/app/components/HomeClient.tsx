'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import MarketCard from './MarketCard'
import { Market } from '../types'

interface Stats {
  markets: number
  signals: number
  solLocked: string
}

export default function HomeClient() {
  const [stats, setStats] = useState<Stats>({ markets: 0, signals: 0, solLocked: '0' })
  const [markets, setMarkets] = useState<Market[]>([])

  useEffect(() => {
    async function fetchData() {
      const [{ count: marketCount }, { count: signalCount }, { data: solData }, { data: marketData }] = await Promise.all([
        supabase.from('markets').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('signals').select('*', { count: 'exact', head: true }),
        supabase.from('markets').select('total_sol_locked'),
        supabase.from('markets').select('*, options:market_options(*)').eq('status', 'active').order('created_at', { ascending: false }).limit(3)
      ])
      const totalSol = solData?.reduce((sum, m) => sum + Number(m.total_sol_locked || 0), 0) || 0
      setStats({ markets: marketCount || 0, signals: signalCount || 0, solLocked: totalSol.toFixed(1) })
      setMarkets(marketData as Market[] || [])
    }
    fetchData()
  }, [])

  return (
    <div className="bg-white">

      {/* HERO */}
      <section className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-8 tracking-widest uppercase">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full inline-block"></span>
            Live on Solana Devnet
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-tight leading-tight mb-6">
            Signal What<br />Should Happen.
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed mb-10">
            A permissionless market for collective demand. Deposit SOL, signal your position, earn yield. Your principal is always returned.
          </p>
          <div className="flex items-center justify-center gap-3 mb-16">
            <Link href="/markets" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors no-underline">
              Browse Markets
            </Link>
            <Link href="/create" className="bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-5 py-2.5 rounded-lg border border-slate-200 transition-colors no-underline">
              Create a Market
            </Link>
          </div>
          <div className="border-t border-slate-100 pt-10 flex items-center justify-center">
            <div className="flex items-center gap-0">
              <div className="text-center px-10">
                <div className="text-3xl font-bold text-slate-900 tabular-nums">{stats.markets}</div>
                <div className="text-sm text-slate-400 mt-1">Active Markets</div>
              </div>
              <div className="w-px h-10 bg-slate-200"></div>
              <div className="text-center px-10">
                <div className="text-3xl font-bold text-slate-900 tabular-nums">{stats.signals}</div>
                <div className="text-sm text-slate-400 mt-1">Signals Cast</div>
              </div>
              <div className="w-px h-10 bg-slate-200"></div>
              <div className="text-center px-10">
                <div className="text-3xl font-bold text-slate-900 tabular-nums">{stats.solLocked} SOL</div>
                <div className="text-sm text-slate-400 mt-1">Total Locked</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-slate-50 border-y border-slate-200 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-blue-600 text-xs font-semibold uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Simple by design</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '01', title: 'Browse or Create', desc: 'Any question, any topic. Create a market in 60 seconds or explore thousands of active markets.' },
              { num: '02', title: 'Signal Your Demand', desc: 'Deposit SOL to signal YES or NO. Your principal is always safe — you never lose your deposit.' },
              { num: '03', title: 'Earn While You Signal', desc: 'Your SOL earns yield while locked. When the market closes, claim your deposit plus your yield share.' },
            ].map(({ num, title, desc }) => (
              <div key={num} className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="text-blue-600 text-xs font-bold tracking-widest mb-4">{num}</div>
                <h3 className="text-slate-900 font-semibold text-base mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ACTIVE MARKETS */}
      <section className="bg-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-blue-600 text-xs font-semibold uppercase tracking-widest mb-1">Live now</p>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Active Markets</h2>
            </div>
            <Link href="/markets" className="text-blue-600 text-sm font-medium hover:underline no-underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {markets.map(m => <MarketCard key={m.id} market={m} />)}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="bg-blue-600 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">Ready to signal?</h2>
          <p className="text-blue-200 text-base mb-8">No permission required. Create a market in under a minute.</p>
          <Link href="/create" className="bg-white text-blue-600 font-semibold text-sm px-6 py-3 rounded-lg hover:bg-blue-50 transition-colors inline-block no-underline">
            Create a Market
          </Link>
        </div>
      </section>

    </div>
  )
}
