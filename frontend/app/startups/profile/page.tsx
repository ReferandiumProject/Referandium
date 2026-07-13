'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/app/context/UserContext'
import { ExternalLink } from 'lucide-react'

const formatDate = (d: string) => {
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}.${dt.getFullYear()}`
}

const truncateAddress = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-4)}`

type StartupPosition = {
  id: string
  market_id: string
  startup_name: string
  startup_slug: string
  direction: 'long' | 'short'
  collateral_usdc: number
  entry_price: number
  current_price: number
  unrealised_pnl: number
  opened_at: string
}

export default function StartupProfilePage() {
  const { authenticated, getAccessToken, login } = usePrivy()
  const { dbUser } = useUser()

  const [balance, setBalance] = useState<{ available_usdc: number; locked_usdc: number } | null>(null)
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

  const [startupPositions, setStartupPositions] = useState<StartupPosition[]>([])
  const [startupPositionsLoading, setStartupPositionsLoading] = useState(false)

  useEffect(() => {
    if (dbUser?.wallet_address) {
      setWithdrawWallet(dbUser.wallet_address)
    }
  }, [dbUser?.wallet_address])

  useEffect(() => {
    if (!authenticated) return
    async function fetchBalance() {
      setBalanceLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')
        const res = await fetch('/api/balance', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setBalance({
            available_usdc: json.data.available_usdc ?? 0,
            locked_usdc: json.data.locked_usdc ?? 0,
          })
        } else {
          setBalance(null)
        }
      } catch (err: any) {
        console.error('Error fetching balance:', err)
        setBalance(null)
      } finally {
        setBalanceLoading(false)
      }
    }
    fetchBalance()
  }, [authenticated, getAccessToken])

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

  const buildShareUrl = (p: StartupPosition) => {
    const pnl = p.unrealised_pnl
    const pnlPercent = p.collateral_usdc > 0 ? (pnl / p.collateral_usdc) * 100 : 0
    const pnlSign = pnl >= 0 ? '+' : '-'
    const percentSign = pnlPercent >= 0 ? '+' : '-'
    const direction = p.direction === 'long' ? 'Long' : 'Short'
    const text = `I'm ${direction} on ${p.startup_name} at $${p.current_price.toFixed(4)} (entry $${p.entry_price.toFixed(4)}) · ${pnlSign}$${Math.abs(pnl).toFixed(4)} (${percentSign}${Math.abs(pnlPercent).toFixed(2)}%) on Startup Sentiment 🚀 https://startup.referandium.com/market/${p.startup_slug}`
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleClosePosition = async (positionId: string) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')

    const res = await fetch('/api/trade/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ position_id: positionId }),
    })

    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json.error || 'Failed to close position')
    }

    setStartupPositions((prev) => prev.filter((p) => p.id !== positionId))
    await refreshBalance()
  }

  const refreshBalance = async () => {
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const res = await fetch('/api/balance', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setBalance({
          available_usdc: json.data.available_usdc ?? 0,
          locked_usdc: json.data.locked_usdc ?? 0,
        })
      }
    } catch (err: any) {
      console.error('Error refreshing balance:', err)
    }
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

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Portfolio</h1>
        <p className="text-slate-500 text-sm font-medium">Sign in to view your portfolio</p>
        <button
          onClick={() => login()}
          className="mt-2 bg-blue-600 text-white font-semibold text-sm py-2.5 px-6 rounded-lg hover:bg-blue-700 transition"
        >
          Sign In
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-8">Portfolio</h1>

        {/* Balance */}
        <div
          className="rounded-xl p-6 mb-8 bg-white"
          style={{ border: '1px solid #E5E5E5' }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider">Balance</p>
            <button
              onClick={refreshBalance}
              className="text-sm font-medium text-[#0D9488] hover:text-[#0F766E] hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-[#6B6B6B] mb-1">Available USDC</p>
              <p className="text-3xl font-bold text-slate-900">
                {balanceLoading ? '—' : `${balance?.available_usdc.toFixed(2) ?? '0.00'} USDC`}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#6B6B6B] mb-1">Locked USDC</p>
              <p className="text-xl font-semibold text-[#6B6B6B]">
                {balanceLoading ? '—' : `${balance?.locked_usdc.toFixed(2) ?? '0.00'} USDC`}
              </p>
            </div>
          </div>
        </div>

        {/* Deposit & Withdraw */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* Deposit Card */}
          <div
            className="rounded-xl p-4 shadow-sm h-full flex flex-col bg-white"
            style={{ border: '1px solid #E5E5E5' }}
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Deposit USDC</h2>

            {depositInfoLoading ? (
              <div className="flex-1 flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : depositInfo ? (
              <div className="flex-1 flex flex-col">
                <div className="space-y-3 flex-1">
                  <div className="bg-slate-50 p-2.5 rounded-lg">
                    <p className="text-xs font-medium text-[#6B6B6B] mb-1">Platform wallet address</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-mono text-slate-900">{truncateAddress(depositInfo.platform_address)}</p>
                      <button
                        onClick={() => handleCopy(depositInfo.platform_address)}
                        className="shrink-0 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#6B6B6B] mb-1">Amount (USDC)</label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full border border-[#E5E5E5] rounded-lg p-2.5 text-sm font-medium focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-3 mt-auto pt-3">
                  <button
                    onClick={handleAddFunds}
                    disabled={addFundsSubmitting || !depositAmount}
                    className="w-full bg-[#0D9488] text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-[#0F766E] transition disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div
            className="rounded-xl p-4 shadow-sm h-full flex flex-col bg-white"
            style={{ border: '1px solid #E5E5E5' }}
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Withdraw USDC</h2>

            <div className="flex-1 flex flex-col">
              <div className="space-y-3 flex-1">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B6B] mb-1">Amount (USDC)</label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full border border-[#E5E5E5] rounded-lg p-2.5 text-sm font-medium focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#6B6B6B] mb-1">Destination wallet address</label>
                  <input
                    type="text"
                    value={withdrawWallet}
                    onChange={(e) => setWithdrawWallet(e.target.value)}
                    placeholder="Solana wallet address"
                    className="w-full border border-[#E5E5E5] rounded-lg p-2.5 text-sm font-medium focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 outline-none bg-white"
                  />
                </div>
              </div>

              <div className="space-y-3 mt-auto pt-3">
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawSubmitting || !withdrawAmount || !withdrawWallet}
                  className="w-full bg-[#0D9488] text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-[#0F766E] transition disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* Open Positions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Open Positions</h2>
            <span className="text-xs text-slate-400">{startupPositions.length} open</span>
          </div>

          {startupPositionsLoading ? (
            <div className="flex items-center justify-center py-12" style={{ border: '1px dashed #E5E5E5', borderRadius: '0.75rem' }}>
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
              <p className="text-slate-500 text-sm font-medium">Loading positions...</p>
            </div>
          ) : startupPositions.length === 0 ? (
            <div className="text-center py-12" style={{ border: '1px dashed #E5E5E5', borderRadius: '0.75rem' }}>
              <p className="text-slate-500 text-sm font-medium">No open positions yet.</p>
              <Link href="/" className="text-[#0D9488] text-sm font-medium hover:underline mt-1 inline-block">Browse markets →</Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid #E5E5E5' }}>
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Startup</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Direction</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Entry</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Current</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">PnL</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Opened</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Close</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {startupPositions.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/market/${p.startup_slug}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition no-underline">
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
                      <td className="px-4 py-3 text-xs text-slate-400">{formatDate(p.opened_at)}</td>
                      <td className="px-4 py-3">
                        <CloseButton positionId={p.id} onClose={handleClosePosition} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => window.open(buildShareUrl(p), '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Share on X"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CloseButton({
  positionId,
  onClose,
}: {
  positionId: string
  onClose: (positionId: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      setError(null)
      return
    }

    setLoading(true)
    try {
      await onClose(positionId)
    } catch (err: any) {
      setError(err.message || 'Failed to close')
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
          confirming
            ? 'bg-red-50 text-[#DC2626] hover:bg-red-100'
            : 'text-slate-400 hover:bg-slate-100 hover:text-[#DC2626]'
        }`}
      >
        {loading ? 'Closing...' : confirming ? 'Confirm?' : 'Close'}
      </button>
      {error && <span className="text-[10px] text-[#DC2626]">{error}</span>}
    </div>
  )
}
