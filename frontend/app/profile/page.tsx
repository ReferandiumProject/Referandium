'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { supabase } from '@/lib/supabaseClient'
import { Market } from '../types'

const formatDate = (d: string) => {
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}.${dt.getFullYear()}`
}

export default function ProfilePage() {
  const { publicKey, connected } = useWallet()
  const { authenticated, getAccessToken } = usePrivy()
  const { dbUser } = useUser()

  const [signals, setSignals] = useState<any[]>([])
  const [myMarkets, setMyMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)

  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const [depositInfo, setDepositInfo] = useState<{ platform_address: string; usdc_mint: string } | null>(null)
  const [depositInfoLoading, setDepositInfoLoading] = useState(false)
  const [depositInfoError, setDepositInfoError] = useState<string | null>(null)

  const [depositAmount, setDepositAmount] = useState('')
  const [addFundsSubmitting, setAddFundsSubmitting] = useState(false)
  const [addFundsResult, setAddFundsResult] = useState<{ new_balance: number } | null>(null)
  const [addFundsError, setAddFundsError] = useState<string | null>(null)

  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)
  const [withdrawResult, setWithdrawResult] = useState<{ signature: string; new_balance: number } | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  type StartupPosition = {
    id: string
    market_id: string
    startup_name: string
    direction: 'long' | 'short'
    collateral_usdc: number
    entry_price: number
    current_price: number
    unrealised_pnl: number
    opened_at: string
  }

  const [startupPositions, setStartupPositions] = useState<StartupPosition[]>([])
  const [startupPositionsLoading, setStartupPositionsLoading] = useState(false)

  useEffect(() => {
    if (connected && publicKey) {
      fetchData()
    } else {
      setSignals([])
      setMyMarkets([])
      setLoading(false)
    }
  }, [connected, publicKey])

  useEffect(() => {
    if (dbUser?.wallet_address) {
      setWithdrawWallet(dbUser.wallet_address)
    }
  }, [dbUser?.wallet_address])

  useEffect(() => {
    if (!dbUser?.id) return
    async function fetchBalance() {
      setBalanceLoading(true)
      try {
        const { data, error } = await supabase
          .from('balances')
          .select('available_usdc')
          .eq('user_id', dbUser!.id)
          .single()
        if (error) {
          console.error('Error fetching balance:', error)
          setBalance(null)
        } else {
          setBalance(data?.available_usdc ?? 0)
        }
      } finally {
        setBalanceLoading(false)
      }
    }
    fetchBalance()
  }, [dbUser?.id])

  useEffect(() => {
    if (!authenticated) return
    async function fetchDepositInfo() {
      setDepositInfoLoading(true)
      try {
        const res = await fetch('/api/deposit/wallet', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to fetch deposit info')
        const data = await res.json()
        setDepositInfo(data)
      } catch (err: any) {
        console.error('Error fetching deposit info:', err)
        setDepositInfoError(err.message || 'Failed to load deposit info')
      } finally {
        setDepositInfoLoading(false)
      }
    }
    fetchDepositInfo()
  }, [authenticated])

  useEffect(() => {
    if (!authenticated) return
    async function fetchStartupPositions() {
      setStartupPositionsLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')
        const res = await fetch('/api/startup-portfolio', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const json = await res.json()
        if (res.ok && json.data?.positions) {
          setStartupPositions(json.data.positions)
        } else {
          setStartupPositions([])
        }
      } catch (err: any) {
        console.error('Error fetching startup positions:', err)
        setStartupPositions([])
      } finally {
        setStartupPositionsLoading(false)
      }
    }
    fetchStartupPositions()
  }, [authenticated, getAccessToken])

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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const refreshBalance = async () => {
    if (!dbUser?.id) return
    const { data } = await supabase
      .from('balances')
      .select('available_usdc')
      .eq('user_id', dbUser.id)
      .single()
    setBalance(data?.available_usdc ?? 0)
  }

  const handleAddFunds = async () => {
    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) {
      setAddFundsError('Amount must be greater than 0')
      return
    }

    setAddFundsSubmitting(true)
    setAddFundsResult(null)
    setAddFundsError(null)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/deposit/devnet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ amount_usdc: amount }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Add funds failed')

      setAddFundsResult(data)
      setDepositAmount('')
      await refreshBalance()
    } catch (err: any) {
      console.error('Add funds error:', err)
      setAddFundsError(err.message || 'Failed to add funds')
    } finally {
      setAddFundsSubmitting(false)
    }
  }

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount)
    if (!amount || amount <= 0) {
      setWithdrawError('Amount must be greater than 0')
      return
    }
    if (!withdrawWallet.trim()) {
      setWithdrawError('Wallet address is required')
      return
    }
    setWithdrawSubmitting(true)
    setWithdrawResult(null)
    setWithdrawError(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ amount_usdc: amount, wallet_address: withdrawWallet.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Withdraw failed')
      setWithdrawResult(data)
      await refreshBalance()
    } catch (err: any) {
      console.error('Withdraw error:', err)
      setWithdrawError(err.message || 'Failed to withdraw')
    } finally {
      setWithdrawSubmitting(false)
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

        {/* Balance */}
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-xl p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Available USDC Balance</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {balanceLoading ? '—' : `${balance?.toFixed(2) ?? '0.00'} USDC`}
              </p>
            </div>
            <button
              onClick={refreshBalance}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-10">

            {/* ── Deposit & Withdraw ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Deposit Card */}
              <div className="border border-slate-200 rounded-xl p-5 shadow-sm h-full flex flex-col">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">Deposit USDC</h2>

                {depositInfoLoading ? (
                  <div className="flex-1 flex items-center justify-center py-6">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : depositInfo ? (
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-3 flex-1">
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Platform Wallet Address</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-mono text-slate-900 break-all">{depositInfo.platform_address}</p>
                          <button
                            onClick={() => handleCopy(depositInfo.platform_address)}
                            className="shrink-0 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition"
                          >
                            Copy
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Amount (USDC)</label>
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 mt-auto pt-3">
                      <button
                        onClick={handleAddFunds}
                        disabled={addFundsSubmitting || !depositAmount}
                        className="w-full bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {addFundsSubmitting ? 'Adding...' : 'Add Funds'}
                      </button>

                      {addFundsResult && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                          <p className="text-emerald-700 text-xs font-medium">
                            Funds added. New balance: {addFundsResult.new_balance.toFixed(2)} USDC.
                          </p>
                        </div>
                      )}

                      {addFundsError && (
                        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                          <p className="text-red-700 text-xs font-medium">{addFundsError}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center py-6">
                    <p className="text-slate-500 text-sm">{depositInfoError || 'Unable to load deposit info.'}</p>
                  </div>
                )}
              </div>

              {/* Withdraw Card */}
              <div className="border border-slate-200 rounded-xl p-5 shadow-sm h-full flex flex-col">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">Withdraw USDC</h2>

                <div className="flex-1 flex flex-col">
                  <div className="space-y-3 flex-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Amount (USDC)</label>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Destination Wallet Address</label>
                      <input
                        type="text"
                        value={withdrawWallet}
                        onChange={(e) => setWithdrawWallet(e.target.value)}
                        placeholder="Solana wallet address"
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 mt-auto pt-3">
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawSubmitting || !withdrawAmount || !withdrawWallet}
                      className="w-full bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {withdrawSubmitting ? 'Processing...' : 'Withdraw'}
                    </button>

                    {withdrawResult && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                        <p className="text-emerald-700 text-xs font-medium mb-1">
                          Withdrawal sent. New balance: {withdrawResult.new_balance.toFixed(2)} USDC.
                        </p>
                        <a
                          href={`https://explorer.solana.com/tx/${withdrawResult.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View on Solana Explorer →
                        </a>
                      </div>
                    )}

                    {withdrawError && (
                      <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                        <p className="text-red-700 text-xs font-medium">{withdrawError}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

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
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">USDC</th>
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
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">{s.usdc_amount}</td>
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

            {/* ── Startup Positions ── */}
            {authenticated && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">Startup Positions</h2>
                  <span className="text-xs text-slate-400">{startupPositions.length} open</span>
                </div>

                {startupPositionsLoading ? (
                  <div className="flex items-center justify-center py-12 border border-dashed border-slate-200 rounded-xl">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <p className="text-slate-500 text-sm font-medium">Loading positions...</p>
                  </div>
                ) : startupPositions.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                    <p className="text-slate-500 text-sm font-medium">No open positions</p>
                    <Link href="/startups" className="text-blue-600 text-sm font-medium hover:underline mt-1 inline-block">Browse startup markets →</Link>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Startup</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Direction</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Entry</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Current</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {startupPositions.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/startups/market/${p.market_id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition no-underline">
                                {p.startup_name}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: p.direction === 'long' ? '#DCFCE7' : '#FEE2E2',
                                  color: p.direction === 'long' ? '#16A34A' : '#DC2626',
                                }}
                              >
                                {p.direction === 'long' ? 'Long' : 'Short'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">${p.entry_price.toFixed(4)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">${p.current_price.toFixed(4)}</td>
                            <td
                              className="px-4 py-3 text-sm font-semibold tabular-nums"
                              style={{ color: p.unrealised_pnl >= 0 ? '#16A34A' : '#DC2626' }}
                            >
                              {p.unrealised_pnl >= 0 ? '+' : ''}${p.unrealised_pnl.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

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
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">USDC Locked</th>
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
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 tabular-nums">{Number(m.total_usdc_locked).toFixed(2)}</td>
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