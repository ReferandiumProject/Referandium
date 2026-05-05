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
    <div className="bg-[#faf8ff] text-[#191b23] antialiased">

      {/* Hero Section */}
      <section className="flex flex-col items-center text-center px-6 py-24">
        <h1 className="font-semibold text-[36px] leading-[1.1] tracking-[-0.04em] text-[#191b23] mb-4 max-w-3xl">
          Signal What Should Happen.
        </h1>
        <p className="font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] text-[#434655] max-w-2xl mb-10">
          The institutional-grade prescription market on Solana. Put your capital behind policy outcomes and earn yields for accurate signaling.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mb-10">
          <Link href="/markets" className="bg-[#2563eb] text-white text-[15px] font-semibold px-6 py-3 rounded-lg shadow-[0px_1px_3px_rgba(15,23,42,0.08)] hover:bg-[#004ac6] transition-colors no-underline">
            Browse Markets
          </Link>
          <Link href="/create" className="bg-white text-[#191b23] text-[15px] font-semibold px-6 py-3 rounded-lg border border-[#E2E8F0] shadow-[0px_1px_3px_rgba(15,23,42,0.08)] hover:bg-[#f3f3fe] transition-colors no-underline">
            Create a Market
          </Link>
        </div>
        <div className="flex gap-6 items-center justify-center text-[12px] font-semibold tracking-[0.05em] text-[#434655]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#2563eb]">{stats.markets}</span> Markets
          </div>
          <div className="w-1 h-1 rounded-full bg-[#c3c6d7]"></div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#2563eb]">{stats.signals}</span> Signals
          </div>
          <div className="w-1 h-1 rounded-full bg-[#c3c6d7]"></div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#2563eb]">{stats.solLocked} SOL</span> Locked
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="bg-[#ededf9] py-24 px-6">
        <div className="max-w-[1280px] mx-auto">
          <h2 className="font-semibold text-[24px] leading-[1.2] tracking-[-0.03em] text-[#191b23] mb-10 text-center">
            How it Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '01', title: 'Browse or Create', desc: 'Explore existing policy proposals or establish a new market to gauge demand for a specific outcome.' },
              { num: '02', title: 'Signal Your Demand', desc: 'Stake your SOL on \'YES\' or \'NO\' to express your conviction in the proposed policy implementation.' },
              { num: '03', title: 'Earn While You Signal', desc: 'Receive automated yield payouts based on the accuracy of your signals as market resolutions occur.' },
            ].map(({ num, title, desc }) => (
              <div key={num} className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-[0px_1px_3px_rgba(15,23,42,0.08)] flex flex-col items-start">
                <span className="font-semibold text-[24px] leading-[1.2] tracking-[-0.03em] text-[#b4c5ff] mb-4">{num}</span>
                <h3 className="font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] text-[#191b23] mb-3">{title}</h3>
                <p className="text-[13px] leading-[1.5] text-[#434655]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Active Markets */}
      <section className="py-24 px-6 max-w-[1280px] mx-auto w-full">
        <div className="flex justify-between items-end mb-10 border-b border-[#E2E8F0] pb-3">
          <h2 className="font-semibold text-[24px] leading-[1.2] tracking-[-0.03em] text-[#191b23]">Active Markets</h2>
          <Link href="/markets" className="text-[12px] font-semibold tracking-[0.05em] text-[#2563eb] hover:underline no-underline">
            View All
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {markets.map(m => <MarketCard key={m.id} market={m} />)}
        </div>
      </section>

    </div>
  )
}
