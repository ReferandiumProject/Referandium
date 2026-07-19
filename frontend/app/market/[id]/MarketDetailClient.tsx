'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { supabase } from '../../../lib/supabaseClient'
import { Market, MarketOption } from '../../types'

type Trade = {
  id: string
  market_id: string
  direction: 'yes' | 'no'
  usdc_amount: number
  created_at: string
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return 'Pending'
    case 'active':
      return 'Active'
    case 'closed':
      return 'Resolved'
    default:
      return status
  }
}

type BadgeColor = 'blue' | 'emerald' | 'amber' | 'slate' | 'red'

function getStatusColor(status: string): BadgeColor {
  switch (status) {
    case 'draft':
      return 'amber'
    case 'active':
      return 'emerald'
    case 'closed':
      return 'blue'
    case 'cancelled':
      return 'red'
    default:
      return 'slate'
  }
}

function Badge({ text, color }: { text: string; color: BadgeColor }) {
  const styles: Record<BadgeColor, string> = {
    blue: 'bg-[#3B82F6]/10 text-[#3B82F6]',
    emerald: 'bg-[#10B981]/10 text-[#10B981]',
    amber: 'bg-amber-500/10 text-amber-500',
    slate: 'bg-[#2A2A2A] text-[#9CA3AF]',
    red: 'bg-[#EF4444]/10 text-[#EF4444]',
  }

  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${styles[color]}`}
    >
      {text}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
    </div>
  )
}

function NotFoundState() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-4 text-center">
      <h1 className="text-2xl font-bold text-white">Market not found</h1>
      <p className="mt-2 text-sm text-[#9CA3AF]">
        The market you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <Link
        href="/markets"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#3B82F6] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
      >
        Back to Markets
      </Link>
    </div>
  )
}

export default function MarketDetailClient() {
  const { id } = useParams() as { id: string }
  const [market, setMarket] = useState<Market | null>(null)
  const [options, setOptions] = useState<MarketOption[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const { getAccessToken } = usePrivy()
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [tradeMessage, setTradeMessage] = useState('')

  useEffect(() => {
    if (!id) return

    async function fetchData() {
      try {
        const res = await fetch(`/api/markets/${id}`)
        if (!res.ok) {
          throw new Error(`Failed to fetch market: ${res.status}`)
        }
        const data = await res.json()
        console.log('[MarketDetail] market API response for id', id, data)
        setMarket(data.market as Market)
        setOptions((data.options || []) as MarketOption[])
        setTrades((data.trades || []) as Trade[])
      } catch (error) {
        console.error('[MarketDetail] error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const handleTrade = async () => {
    const shares = Number(amount)
    if (!Number.isFinite(shares) || shares <= 0) {
      setTradeMessage('Enter a positive number of shares')
      return
    }
    const rawOptions = options as unknown as { id: string; label: string }[]
    const option = rawOptions.find((o) => o.label?.toUpperCase() === selectedSide.toUpperCase())
    if (!option) {
      setTradeMessage('Option not found')
      return
    }
    setBuying(true)
    setTradeMessage('')
    try {
      const token = await getAccessToken()
      if (!token) {
        setTradeMessage('Not signed in')
        return
      }
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          market_id: id,
          option_id: option.id,
          type: 'buy',
          shares,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTradeMessage(typeof data.error === 'string' ? data.error : `Trade failed (${res.status})`)
      } else {
        setTradeMessage(`Bought ${shares} ${selectedSide.toUpperCase()} shares. New balance: ${Number(data.newBalance).toFixed(6)}`)
      }
    } catch (err) {
      setTradeMessage(err instanceof Error ? err.message : 'Trade request failed')
    } finally {
      setBuying(false)
    }
  }

  if (loading) return <LoadingState />
  if (!market) return <NotFoundState />

  const yesPrice = 0.5
  const noPrice = 0.5

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 pb-24 pt-8">
      <main className="mx-auto max-w-[1200px]">
        <div className="mb-6">
          <Link
            href="/markets"
            className="text-sm text-[#9CA3AF] transition-colors hover:text-white"
          >
            ← Markets
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-8">
            {/* Header card */}
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge text={market.category || 'General'} color="blue" />
                <Badge
                  text={getStatusLabel(market.status)}
                  color={getStatusColor(market.status)}
                />
              </div>

              <h1 className="break-words text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
                {market.title}
              </h1>

              {market.description && (
                <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF]">
                  {market.description}
                </p>
              )}

              {((market as any).resolution_criteria || market.resolve_criteria) && (
                <div className="mt-6 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4">
                  <h3 className="mb-2 text-sm font-semibold text-white">
                    Resolution Criteria
                  </h3>
                  <p className="text-sm text-[#9CA3AF]">{(market as any).resolution_criteria || market.resolve_criteria}</p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-[#9CA3AF]">
                <span>
                  Ends <span className="text-white">{formatDate((market as any).end_date || market.end_time)}</span>
                </span>
                <span className="hidden sm:inline">·</span>
                <span>
                  {Number(market.total_usdc_locked || 0).toLocaleString()} USDC Vol
                </span>
              </div>
            </div>

            {/* Odds card */}
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-6">
              <h3 className="mb-4 text-sm font-semibold text-white">Market Odds</h3>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#10B981]">
                  YES ${yesPrice.toFixed(2)}
                </span>
                <span className="font-semibold text-[#EF4444]">
                  NO ${noPrice.toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#2A2A2A]">
                <div className="flex h-full">
                  <div className="h-full w-1/2 bg-[#10B981]" />
                  <div className="h-full w-1/2 bg-[#EF4444]" />
                </div>
              </div>
            </div>

            {/* Trade history */}
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-6">
              <h3 className="mb-4 text-lg font-semibold text-white">Trade History</h3>
              {trades.length === 0 ? (
                <p className="text-sm text-[#9CA3AF]">No trades yet.</p>
              ) : (
                <div>
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-[#2A2A2A] text-left text-[#9CA3AF]">
                        <th className="pb-2 font-medium">Side</th>
                        <th className="pb-2 font-medium">Amount</th>
                        <th className="pb-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A2A2A]">
                      {trades.map((trade) => (
                        <tr key={trade.id}>
                          <td
                            className={`py-3 pr-2 font-medium ${
                              trade.direction === 'yes'
                                ? 'text-[#10B981]'
                                : 'text-[#EF4444]'
                            }`}
                          >
                            {trade.direction.toUpperCase()}
                          </td>
                          <td className="min-w-0 break-words py-3 pr-2 text-white">
                            ${Number(trade.usdc_amount).toLocaleString()}
                          </td>
                          <td className="min-w-0 break-words py-3 text-[#9CA3AF]">
                            {new Date(trade.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right column - Buy panel */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-6 lg:sticky lg:top-24">
              <h3 className="mb-4 text-lg font-semibold text-white">Buy Shares</h3>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setSelectedSide('yes')}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    selectedSide === 'yes'
                      ? 'bg-[#10B981] text-white'
                      : 'border border-[#2A2A2A] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  YES
                </button>
                <button
                  onClick={() => setSelectedSide('no')}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    selectedSide === 'no'
                      ? 'bg-[#EF4444] text-white'
                      : 'border border-[#2A2A2A] text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  NO
                </button>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-[#9CA3AF]">
                  Amount (USDC)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] py-2.5 pl-3 pr-12 text-sm text-white placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">
                    USDC
                  </span>
                </div>
              </div>

              <button
                onClick={handleTrade}
                disabled={buying}
                className="w-full rounded-lg bg-[#3B82F6] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {buying ? 'Buying...' : `Buy ${selectedSide.toUpperCase()}`}
              </button>
              {tradeMessage && (
                <p className="mt-2 text-xs text-[#9CA3AF]">{tradeMessage}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
