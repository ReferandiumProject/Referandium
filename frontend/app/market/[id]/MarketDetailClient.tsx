'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getPrice, getSharesForBuyCost, getSharesForSellProceeds, getSellProceeds } from '../../../lib/lmsr'
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
    slate: 'bg-[#F3F4F6] text-[#6B7280]',
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
    <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
    </div>
  )
}

function NotFoundState() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4 text-center">
      <h1 className="text-2xl font-bold text-[#111827]">Market not found</h1>
      <p className="mt-2 text-sm text-[#6B7280]">
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
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [positions, setPositions] = useState<Record<string, number>>({})
  const [positionsKey, setPositionsKey] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const loadMarket = useCallback(async () => {
    if (!id) return

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
  }, [id])

  useEffect(() => {
    loadMarket()
  }, [loadMarket])

  useEffect(() => {
    if (mode !== 'sell') return
    async function fetchPositions() {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/profile/positions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = await res.json().catch(() => ({}))
      const map: Record<string, number> = {}
      for (const pos of json.positions || []) {
        if (pos.market_id === id) {
          map[pos.option_id] = Number(pos.shares || 0)
        }
      }
      setPositions(map)
    }
    fetchPositions()
  }, [mode, id, positionsKey, getAccessToken])

  useEffect(() => {
    setConfirming(false)
  }, [mode, selectedSide])

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  useEffect(() => {
    if (mode !== 'sell') {
      setAmount('')
      return
    }
    const rawOptions = options as unknown as { id: string; label: string }[]
    const option = rawOptions.find((o) => o.label?.toUpperCase() === selectedSide.toUpperCase())
    const owned = option ? positions[option.id] || 0 : 0
    if (owned <= 0) {
      setAmount('')
      return
    }
    const lmsrOpts = options as unknown as Array<{ label: string; shares_outstanding: number }>
    const yes = lmsrOpts.find((o) => o.label?.toUpperCase() === 'YES')
    const no = lmsrOpts.find((o) => o.label?.toUpperCase() === 'NO')
    const qYes = Number(yes?.shares_outstanding || 0)
    const qNo = Number(no?.shares_outstanding || 0)
    const optionLabel = selectedSide.toUpperCase() as 'YES' | 'NO'
    const proceeds = getSellProceeds(qYes, qNo, optionLabel, owned)
    setAmount(Number.isFinite(proceeds) && proceeds > 0 ? String(proceeds.toFixed(2)) : '')
  }, [mode, selectedSide, options, positions])

  const handleTrade = async () => {
    const rawOptions = options as unknown as { id: string; label: string }[]
    const option = rawOptions.find((o) => o.label?.toUpperCase() === selectedSide.toUpperCase())
    if (!option) {
      setTradeMessage('Option not found')
      return
    }
    const lmsrOpts = options as unknown as Array<{ label: string; shares_outstanding: number }>
    const yes = lmsrOpts.find((o) => o.label?.toUpperCase() === 'YES')
    const no = lmsrOpts.find((o) => o.label?.toUpperCase() === 'NO')
    const qYes = Number(yes?.shares_outstanding || 0)
    const qNo = Number(no?.shares_outstanding || 0)
    const optionLabel = selectedSide.toUpperCase() as 'YES' | 'NO'
    const dollars = Number(amount)
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setTradeMessage('Enter a positive USDC amount')
      return
    }
    const shares = mode === 'buy'
      ? getSharesForBuyCost(qYes, qNo, optionLabel, dollars)
      : getSharesForSellProceeds(qYes, qNo, optionLabel, dollars)
    if (!Number.isFinite(shares) || shares <= 0) {
      setTradeMessage('USDC amount is too large for current market state')
      return
    }
    if (mode === 'sell') {
      const owned = positions[option.id] || 0
      if (owned <= 0) {
        setTradeMessage(`No ${optionLabel} position to sell`)
        return
      }
      if (shares > owned) {
        setTradeMessage(`Amount exceeds your ${optionLabel} position by ${(shares - owned).toFixed(2)} shares`)
        return
      }
      if (!confirming) {
        setTradeMessage(`≈ ${shares.toFixed(2)} ${optionLabel} shares — click again to confirm`)
        setConfirming(true)
        return
      }
      console.log('[MarketDetailClient sell] client values', {
        owned,
        computedShares: shares,
        optionId: option.id,
        optionLabel,
        amount,
      })
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
          type: mode,
          shares,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTradeMessage(typeof data.error === 'string' ? data.error : `Trade failed (${res.status})`)
      } else {
        if (mode === 'buy') {
          setTradeMessage(`Bought ${shares.toFixed(2)} ${optionLabel} shares. New balance: ${Number(data.newBalance).toFixed(6)}`)
        } else {
          const proceeds = Number(data.trade?.usdc_amount ?? 0) - Number(data.trade?.fee ?? 0)
          setTradeMessage(`Sold ${shares.toFixed(2)} ${optionLabel} shares. Proceeds: ${proceeds.toFixed(4)} USDC. New balance: ${Number(data.newBalance).toFixed(6)}`)
        }
        await loadMarket()
        setPositionsKey((k) => k + 1)
      }
    } catch (err) {
      setTradeMessage(err instanceof Error ? err.message : 'Trade request failed')
    } finally {
      setConfirming(false)
      setBuying(false)
    }
  }

  if (loading) return <LoadingState />
  if (!market) return <NotFoundState />

  const lmsrOptions = (options as unknown) as Array<{ label: string; shares_outstanding: number }>
  const yesOption = lmsrOptions.find((o) => o.label?.toUpperCase() === 'YES')
  const noOption = lmsrOptions.find((o) => o.label?.toUpperCase() === 'NO')
  const qYes = Number(yesOption?.shares_outstanding || 0)
  const qNo = Number(noOption?.shares_outstanding || 0)
  const yesPrice = getPrice(qYes, qNo, 'YES')
  const noPrice = getPrice(qYes, qNo, 'NO')
  const volume = trades.reduce((sum, trade) => sum + Number(trade.usdc_amount || 0), 0)

  const tradeOptions = (options as unknown) as Array<{ id: string; label: string }>
  const selectedOption = tradeOptions.find((o) => o.label?.toUpperCase() === selectedSide.toUpperCase())
  const owned = selectedOption ? positions[selectedOption.id] || 0 : 0

  return (
    <div className="min-h-screen bg-[#F9FAFB] px-4 pb-24 pt-8">
      <main className="mx-auto max-w-[1200px]">
        <div className="mb-6">
          <Link
            href="/markets"
            className="text-sm text-[#6B7280] transition-colors hover:text-[#111827]"
          >
            ← Markets
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-8">
            {/* Header card */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge text={market.category || 'General'} color="blue" />
                <Badge
                  text={getStatusLabel(market.status)}
                  color={getStatusColor(market.status)}
                />
              </div>

              <h1 className="break-words text-xl font-bold tracking-tight text-[#111827] sm:text-2xl lg:text-3xl">
                {market.title}
              </h1>

              {market.description && (
                <p className="mt-4 text-sm leading-relaxed text-[#6B7280]">
                  {market.description}
                </p>
              )}

              {((market as any).resolution_criteria || market.resolve_criteria) && (
                <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[#111827]">
                    Resolution Criteria
                  </h3>
                  <p className="text-sm text-[#6B7280]">{(market as any).resolution_criteria || market.resolve_criteria}</p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-[#6B7280]">
                <span>
                  Ends <span className="text-[#111827]">{formatDate((market as any).end_date || market.end_time)}</span>
                </span>
                <span className="hidden sm:inline">·</span>
                <span>
                  {volume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC Vol
                </span>
              </div>
            </div>

            {/* Odds card */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold text-[#111827]">Market Odds</h3>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#10B981]">
                  YES ${yesPrice.toFixed(2)}
                </span>
                <span className="font-semibold text-[#EF4444]">
                  NO ${noPrice.toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                <div className="flex h-full">
                  <div className="h-full bg-[#10B981]" style={{ width: `${yesPrice * 100}%` }} />
                  <div className="h-full bg-[#EF4444]" style={{ width: `${noPrice * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Trade history */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-[#111827]">Trade History</h3>
              {trades.length === 0 ? (
                <p className="text-sm text-[#6B7280]">No trades yet.</p>
              ) : (
                <div>
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] text-left text-[#6B7280]">
                        <th className="pb-2 font-medium">Side</th>
                        <th className="pb-2 font-medium">Amount</th>
                        <th className="pb-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
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
                          <td className="min-w-0 break-words py-3 pr-2 text-[#111827]">
                            ${Number(trade.usdc_amount).toFixed(2)}
                          </td>
                          <td className="min-w-0 break-words py-3 text-[#6B7280]">
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

          {/* Right column - Trade panel */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 lg:sticky lg:top-24">
              <h3 className="mb-4 text-lg font-semibold text-[#111827]">Trade Shares</h3>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('buy')}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    mode === 'buy'
                      ? 'bg-[#3B82F6] text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Buy
                </button>
                <button
                  onClick={() => setMode('sell')}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    mode === 'sell'
                      ? 'bg-[#EF4444] text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  Sell
                </button>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedSide('yes')}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    selectedSide === 'yes'
                      ? 'bg-[#10B981] text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  YES
                </button>
                <button
                  onClick={() => setSelectedSide('no')}
                  className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    selectedSide === 'no'
                      ? 'bg-[#EF4444] text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  NO
                </button>
              </div>

              <p className="mb-2 text-xs text-[#6B7280]">
                {owned === 0
                  ? `You own 0 ${selectedSide.toUpperCase()} shares`
                  : `Owned: ${owned} ${selectedSide.toUpperCase()} shares${(() => {
                      const price = getPrice(qYes, qNo, selectedSide.toUpperCase() as 'YES' | 'NO')
                      const value = owned * price
                      return Number.isFinite(value) ? ` (~$${value.toFixed(2)})` : ''
                    })()}`}
              </p>

              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-[#6B7280]">
                  USDC Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2.5 pl-3 pr-12 text-sm text-[#111827] placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280]">
                    USDC
                  </span>
                </div>
                {(() => {
                  const target = Number(amount)
                  let estimate: string | null = null
                  if (Number.isFinite(target) && target > 0) {
                    const est =
                      mode === 'buy'
                        ? getSharesForBuyCost(qYes, qNo, selectedSide.toUpperCase() as 'YES' | 'NO', target)
                        : getSharesForSellProceeds(qYes, qNo, selectedSide.toUpperCase() as 'YES' | 'NO', target)
                    if (Number.isFinite(est) && est > 0) {
                      estimate = `≈ ${est.toFixed(2)} shares`
                    }
                  }
                  return estimate ? <p className="mt-1.5 text-xs text-[#6B7280]">{estimate}</p> : null
                })()}
                <p className="mt-1.5 text-xs text-[#6B7280]">
                  Final amount may differ slightly once the 0.5% fee is applied.
                </p>
              </div>

              <button
                onClick={handleTrade}
                disabled={buying || (mode === 'sell' && owned <= 0)}
                className="w-full rounded-lg bg-[#3B82F6] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {buying
                  ? mode === 'buy'
                    ? 'Buying...'
                    : 'Selling...'
                  : mode === 'sell'
                    ? owned <= 0
                      ? 'No position'
                      : confirming
                        ? 'Confirm Sell?'
                        : `Sell ${selectedSide.toUpperCase()}`
                    : `Buy ${selectedSide.toUpperCase()}`}
              </button>
              {tradeMessage && (
                <p className="mt-2 text-xs text-[#6B7280]">{tradeMessage}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
