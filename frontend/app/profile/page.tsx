'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { supabase } from '@/lib/supabaseClient'
import { Market } from '../types'

const formatDate = (d: string) => {
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}.${dt.getFullYear()}`
}

export default function ProfilePage() {
  const { publicKey, connected } = useWallet()

  const [signals, setSignals] = useState<any[]>([])
  const [myMarkets, setMyMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (connected && publicKey) {
      fetchData()
    } else {
      setSignals([])
      setMyMarkets([])
      setLoading(false)
    }
  }, [connected, publicKey])

  const fetchData = async () => {
    if (!publicKey) return
    setLoading(true)
    const wallet = publicKey.toBase58()

    try {
      // Fetch signals with market titles
      const { data: signalsData } = await supabase
        .from('signals')
        .select('*')
        .eq('user_wallet', wallet)
        .order('created_at', { ascending: false })

      if (signalsData && signalsData.length > 0) {
        const marketIds = [...new Set(signalsData.map((s: any) => s.market_id))]
        const { data: marketsData } = await supabase.from('markets').select('id, title').in('id', marketIds)
        const merged = signalsData.map((s: any) => ({
          ...s,
          market_title: marketsData?.find((m: any) => m.id === s.market_id)?.title || 'Deleted Market',
        }))
        setSignals(merged)
      } else {
        setSignals([])
      }

      // Fetch markets created by this wallet
      const { data: myMkts } = await supabase
        .from('markets')
        .select('*')
        .eq('gookie_wallet', wallet)
        .order('created_at', { ascending: false })

      setMyMarkets((myMkts || []) as Market[])
    } catch (err) {
      console.error('Error fetching profile data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!connected) {
    return (
      <div className="bg-white min-h-screen flex flex-col items-center justify-center gap-2">
        <p className="text-slate-900 font-medium">Connect your wallet to view your profile</p>
        <p className="text-slate-400 text-sm">Your signals and created markets will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Wallet address */}
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Profile</h1>
        <p className="text-slate-400 text-sm font-mono mb-8">{publicKey?.toBase58()}</p>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-10">

            {/* ── My Signals ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">My Signals</h2>
                <span className="text-xs text-slate-400">{signals.length} total</span>
              </div>

              {signals.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500 text-sm font-medium">No prescriptions yet</p>
                  <Link href="/markets" className="text-blue-600 text-sm font-medium hover:underline mt-1 inline-block">Browse markets →</Link>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Market</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Direction</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">SOL</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Yield</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {signals.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/market/${s.market_id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition no-underline">
                              {s.market_title}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              s.signal_direction === 'yes' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                            }`}>
                              {s.signal_direction.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">{s.sol_amount}</td>
                          <td className="px-4 py-3 text-sm text-emerald-600 font-medium tabular-nums">
                            {s.yield_earned ? `+${s.yield_earned.toFixed(4)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">{formatDate(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── My Markets ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900">My Markets</h2>
                <span className="text-xs text-slate-400">{myMarkets.length} total</span>
              </div>

              {myMarkets.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-slate-500 text-sm font-medium">No markets created yet</p>
                  <Link href="/create" className="text-blue-600 text-sm font-medium hover:underline mt-1 inline-block">Create a market →</Link>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Title</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Signals</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">SOL Locked</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Ends</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myMarkets.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/market/${m.id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition no-underline">
                              {m.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                              m.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                              m.status === 'closed' ? 'bg-slate-100 text-slate-500' :
                              'bg-amber-50 text-amber-600'
                            }`}>
                              {m.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">{m.total_signals}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">{Number(m.total_sol_locked).toFixed(2)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{formatDate(m.end_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}