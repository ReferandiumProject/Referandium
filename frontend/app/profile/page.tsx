'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { getPrice, getSellProceeds, getSharesForSellProceeds } from '../../lib/lmsr'
import { useUser } from '../context/UserContext'

type Position = {
  id: string
  market_id: string
  option_id: string
  market_title: string
  market_status: string
  option_label: string
  shares: number
  avg_price: number
}

type Balance = {
  available_usdc: number
  locked_usdc: number
}

type DepositInfo = {
  platform_address: string
  usdc_mint: string
}

type Tab = 'active' | 'closed'

const formatUsd = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '—'
}

const formatShares = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? v.toFixed(2) : '—'
}

export default function ProfilePage() {
  const { authenticated, getAccessToken, login } = usePrivy()
  const { dbUser } = useUser()
  const { fundWallet } = useFundWallet({
    onUserExited: () => console.log('[Privy] card funding flow exited'),
  })

  const [balance, setBalance] = useState<Balance | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [totalTrades, setTotalTrades] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sellAmounts, setSellAmounts] = useState<Record<string, string>>({})
  const [sellResponses, setSellResponses] = useState<Record<string, string>>({})
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [marketDetails, setMarketDetails] = useState<Record<string, { qYes: number; qNo: number }>>({})
  const [activeTab, setActiveTab] = useState<Tab>('active')

  const [depositMode, setDepositMode] = useState<'devnet' | 'wallet' | 'card'>('devnet')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [depositSig, setDepositSig] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [cardAmount, setCardAmount] = useState('')

  const fetchProfile = async () => {
    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [balanceRes, positionsRes] = await Promise.all([
        fetch('/api/balance', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/profile/positions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const balanceJson = await balanceRes.json().catch(() => ({}))
      const positionsJson = await positionsRes.json().catch(() => ({}))

      if (!balanceRes.ok) {
        setError(balanceJson.error || 'Failed to load balance')
      } else {
        setBalance(balanceJson.data || null)
      }

      if (!positionsRes.ok) {
        setError((prev) => prev || positionsJson.error || 'Failed to load positions')
      } else {
        setPositions(positionsJson.positions || [])
        setTotalTrades(positionsJson.totalTrades ?? 0)
        const opts = (positionsJson.options || []) as Array<{ market_id: string; label: string; shares_outstanding: number }>
        const details: Record<string, { qYes: number; qNo: number }> = {}
        for (const o of opts) {
          if (!details[o.market_id]) {
            details[o.market_id] = { qYes: 0, qNo: 0 }
          }
          const label = (o.label ?? '').toUpperCase() as 'YES' | 'NO'
          if (label === 'YES') details[o.market_id].qYes = Number(o.shares_outstanding || 0)
          if (label === 'NO') details[o.market_id].qNo = Number(o.shares_outstanding || 0)
        }
        setMarketDetails(details)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) {
      fetchProfile()
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    setSellAmounts((prev) => {
      const init: Record<string, string> = {}
      positions?.forEach((p) => {
        init[p.id] = prev[p.id] ?? ''
      })
      return init
    })
  }, [positions])

  useEffect(() => {
    if (!confirmingId) return
    const timer = setTimeout(() => setConfirmingId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmingId])

  useEffect(() => {
    if (!positions || !Object.keys(marketDetails).length) return
    const next: Record<string, string> = {}
    for (const p of positions) {
      const md = marketDetails[p.market_id]
      if (!md) {
        next[p.id] = ''
        continue
      }
      const label = (p.option_label ?? '').toUpperCase() as 'YES' | 'NO'
      const proceeds = getSellProceeds(md.qYes, md.qNo, label, p.shares)
      next[p.id] = Number.isFinite(proceeds) && proceeds > 0 ? String(proceeds.toFixed(2)) : ''
    }
    setSellAmounts(next)
  }, [positions, marketDetails])

  const openPositionsValue = useMemo(() => {
    if (!positions) return 0
    return positions.reduce((sum, p) => {
      if (p.market_status !== 'active') return sum
      const md = marketDetails[p.market_id]
      if (!md) return sum
      const label = (p.option_label ?? '').toUpperCase() as 'YES' | 'NO'
      if (label !== 'YES' && label !== 'NO') return sum
      const price = getPrice(md.qYes, md.qNo, label)
      return sum + p.shares * price
    }, 0)
  }, [positions, marketDetails])

  const filteredPositions = useMemo(() => {
    if (!positions) return []
    return positions.filter((p) =>
      activeTab === 'active' ? p.market_status === 'active' : p.market_status !== 'active'
    )
  }, [positions, activeTab])

  const handleDevnetDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) {
      setMessage('Amount must be greater than 0')
      return
    }

    const res = await fetch('/api/deposit/devnet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount_usdc: amount }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Deposit failed')
      return
    }

    setMessage(`Deposited. New balance: ${json.new_balance}`)
    setDepositAmount('')
    fetchProfile()
  }

  const loadDepositInfo = async () => {
    const res = await fetch('/api/deposit/wallet', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Failed to load deposit info')
      return
    }
    setDepositInfo(json)
  }

  const handleWalletDepositConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    if (!depositSig.trim()) {
      setMessage('Transaction signature is required')
      return
    }

    const res = await fetch('/api/deposit/wallet/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ signature: depositSig.trim() }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Confirm failed')
      return
    }

    setMessage(`Credited ${json.credited_amount}. New balance: ${json.new_balance}`)
    setDepositSig('')
    fetchProfile()
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    const amount = parseFloat(withdrawAmount)
    if (!amount || amount <= 0) {
      setMessage('Amount must be greater than 0')
      return
    }
    if (!withdrawWallet.trim()) {
      setMessage('Wallet address is required')
      return
    }

    const res = await fetch('/api/withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount_usdc: amount,
        wallet_address: withdrawWallet.trim(),
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(json.error || 'Withdraw failed')
      return
    }

    setMessage(`Withdrawn. New balance: ${json.new_balance}`)
    setWithdrawAmount('')
    setWithdrawWallet('')
    fetchProfile()
  }

  const handleSell = async (position: Position) => {
    setMessage(null)
    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    const md = marketDetails[position.market_id]
    if (!md) {
      setSellResponses((r) => ({ ...r, [position.id]: 'Market data not loaded' }))
      return
    }

    const raw = sellAmounts[position.id] ?? ''
    const dollars = parseFloat(raw)
    if (!dollars || dollars <= 0) {
      setSellResponses((r) => ({ ...r, [position.id]: 'Invalid USDC amount' }))
      return
    }

    const label = (position.option_label ?? '').toUpperCase() as 'YES' | 'NO'
    const shares = getSharesForSellProceeds(md.qYes, md.qNo, label, dollars)
    if (!Number.isFinite(shares) || shares <= 0) {
      setSellResponses((r) => ({ ...r, [position.id]: 'USDC amount is too large for current market state' }))
      return
    }
    if (shares > position.shares) {
      setSellResponses((r) => ({ ...r, [position.id]: `Amount exceeds position by ${(shares - position.shares).toFixed(2)} shares` }))
      return
    }

    if (confirmingId !== position.id) {
      setConfirmingId(position.id)
      setSellResponses((r) => ({
        ...r,
        [position.id]: `≈ ${shares.toFixed(2)} shares — click again to confirm`,
      }))
      return
    }

    console.log('[profile sell] client values', {
      owned: position.shares,
      computedShares: shares,
      optionId: position.option_id,
      optionLabel: label,
      amount: dollars,
    })

    setConfirmingId(null)
    setSellResponses((r) => ({ ...r, [position.id]: 'Selling...' }))

    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        market_id: position.market_id,
        option_id: position.option_id,
        type: 'sell',
        shares,
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSellResponses((r) => ({ ...r, [position.id]: json.error || `Sell failed (${res.status})` }))
      return
    }

    const trade = json.trade || {}
    const proceeds = Number(trade.usdc_amount ?? 0) - Number(trade.fee ?? 0)
    setSellResponses((r) => ({
      ...r,
      [position.id]: `Sold ${shares.toFixed(2)} shares. Proceeds: ${proceeds.toFixed(4)} USDC. New balance: ${json.newBalance}`,
    }))
    fetchProfile()
  }

  const getPositionPrices = (p: Position) => {
    const md = marketDetails[p.market_id]
    const label = (p.option_label ?? '').toUpperCase() as 'YES' | 'NO'
    const active = p.market_status === 'active'
    const currentPrice = active && md ? getPrice(md.qYes, md.qNo, label) : null
    const value = active && currentPrice !== null ? p.shares * currentPrice : null
    return { label, currentPrice, value, active }
  }

  const renderSellControl = (p: Position) => {
    const md = marketDetails[p.market_id]
    const label = (p.option_label ?? '').toUpperCase() as 'YES' | 'NO'
    const dollars = parseFloat(sellAmounts[p.id] ?? '0')
    let estimate: string | null = null
    if (md && dollars > 0) {
      const est = getSharesForSellProceeds(md.qYes, md.qNo, label, dollars)
      if (Number.isFinite(est) && est > 0) {
        estimate = `≈ ${est.toFixed(2)} shares`
      }
    }
    return (
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
          USDC to sell
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="number"
            step="0.01"
            value={sellAmounts[p.id] ?? ''}
            onChange={(e) =>
              setSellAmounts((prev) => ({
                ...prev,
                [p.id]: e.target.value,
              }))
            }
            placeholder="USDC amount"
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-40"
          />
          <button
            onClick={() => handleSell(p)}
            className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors sm:w-auto ${
              confirmingId === p.id ? 'bg-[#EF4444] hover:bg-red-600' : 'bg-[#3B82F6] hover:bg-blue-600'
            }`}
          >
            {confirmingId === p.id ? 'Confirm Sell?' : 'Sell'}
          </button>
        </div>
        {estimate && <p className="mt-2 text-xs text-[#6B7280]">{estimate}</p>}
        <p className="mt-1 text-xs text-[#9CA3AF]">Final amount may differ after 0.5% fee.</p>
        {sellResponses[p.id] && <p className="mt-2 text-xs text-[#6B7280]">{sellResponses[p.id]}</p>}
      </div>
    )
  }

  const depositLabels: Record<'devnet' | 'wallet' | 'card', string> = {
    devnet: 'Devnet Faucet',
    wallet: 'Wallet Deposit',
    card: 'Card',
  }

  const tabClass = (tab: Tab, value: Tab) =>
    `rounded-md px-4 py-1.5 text-sm font-medium transition ${
      tab === value
        ? 'bg-white text-[#111827] shadow-sm'
        : 'text-[#6B7280] hover:text-[#111827]'
    }`

  if (!authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-semibold text-[#111827]">Profile</h1>
          <p className="mb-6 text-sm text-[#6B7280]">
            Sign in to view your profile
          </p>
          <button
            onClick={() => login()}
            className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            Sign In
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F9FAFB] px-4 pb-24 pt-6 text-[#111827] sm:pt-8">
      <div className="mx-auto max-w-7xl">
        {loading && (
          <p className="mb-4 text-sm text-[#6B7280]">Loading profile...</p>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-3 text-sm text-[#10B981]">
            {message}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#111827]">Portfolio</h1>
              <p className="mt-1 text-sm text-[#6B7280]">Manage your balance, positions, and funds</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => document.getElementById('deposit')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Deposit
              </button>
              <button
                onClick={() => document.getElementById('withdraw')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-lg border border-[#3B82F6] bg-white px-5 py-2.5 text-sm font-semibold text-[#3B82F6] transition-colors hover:bg-[#F9FAFB]"
              >
                Withdraw
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Available</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(balance?.available_usdc)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Locked</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(balance?.locked_usdc)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Open Positions</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(openPositionsValue)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Total Trades</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{totalTrades}</p>
            </div>
          </div>
        </section>

        <section id="deposit" className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[#111827]">Deposit</h2>
          <div className="mb-4 inline-flex rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-1">
            {(['devnet', 'wallet', 'card'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setDepositMode(m)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  depositMode === m
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {depositLabels[m]}
              </button>
            ))}
          </div>

          {depositMode === 'devnet' ? (
            <form onSubmit={handleDevnetDeposit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="number"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount USDC"
                className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Deposit Devnet
              </button>
            </form>
          ) : depositMode === 'wallet' ? (
            <div>
              <button
                onClick={loadDepositInfo}
                className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Load Deposit Address
              </button>
              {depositInfo && (
                <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <p className="mb-2 text-xs text-[#6B7280] break-all">
                    <span className="font-medium text-[#111827]">Address:</span>{' '}
                    {depositInfo.platform_address}
                  </p>
                  <p className="mb-4 text-xs text-[#6B7280] break-all">
                    <span className="font-medium text-[#111827]">USDC Mint:</span>{' '}
                    {depositInfo.usdc_mint}
                  </p>
                  <form
                    onSubmit={handleWalletDepositConfirm}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center"
                  >
                    <input
                      type="text"
                      value={depositSig}
                      onChange={(e) => setDepositSig(e.target.value)}
                      placeholder="Deposit transaction signature"
                      className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:flex-1"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      Confirm Wallet Deposit
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  step="0.01"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="Amount USDC (optional)"
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48"
                />
                <button
                  onClick={async () => {
                    if (!dbUser?.wallet_address) {
                      setMessage('No wallet address available')
                      return
                    }
                    try {
                      await fundWallet({
                        address: dbUser.wallet_address,
                        options: {
                          asset: 'USDC',
                          amount: cardAmount || undefined,
                        } as any,
                      })
                    } catch (err: any) {
                      console.error('[Privy] fundWallet error:', err)
                      setMessage(err?.message || 'Card funding failed to open')
                    }
                  }}
                  disabled={!dbUser?.wallet_address}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Buy USDC with Card
                </button>
              </div>
              <p className="text-xs text-[#6B7280]">
                Funds go to your embedded Solana wallet. After they arrive, use the Wallet Deposit flow to credit your platform balance.
              </p>
            </div>
          )}
        </section>

        <section id="withdraw" className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[#111827]">Withdraw</h2>
          <form onSubmit={handleWithdraw} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="number"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount USDC"
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48"
            />
            <input
              type="text"
              value={withdrawWallet}
              onChange={(e) => setWithdrawWallet(e.target.value)}
              placeholder="Destination wallet address"
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:flex-1"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
            >
              Withdraw
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[#111827]">Positions</h2>
            <div className="inline-flex rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-1">
              <button onClick={() => setActiveTab('active')} className={tabClass('active', activeTab)}>
                Active
              </button>
              <button onClick={() => setActiveTab('closed')} className={tabClass('closed', activeTab)}>
                Closed
              </button>
            </div>
          </div>

          {positions === null ? (
            <p className="text-sm text-[#6B7280]">Loading positions...</p>
          ) : filteredPositions.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No {activeTab} positions</p>
          ) : (
            <>
              <div className="hidden lg:block overflow-hidden rounded-lg border border-[#E5E7EB]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F9FAFB] text-[#6B7280]">
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Market</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Side</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Avg Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Current Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Value</th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {filteredPositions.map((p) => {
                      const { label, currentPrice, value, active } = getPositionPrices(p)
                      return (
                        <tr key={p.id} className="hover:bg-[#F9FAFB]">
                          <td className="px-4 py-3 font-medium text-[#111827]">{p.market_title}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                                label === 'YES'
                                  ? 'bg-[#10B981]/10 text-[#10B981]'
                                  : 'bg-[#EF4444]/10 text-[#EF4444]'
                              }`}
                            >
                              {p.option_label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-[#111827]">{formatUsd(p.avg_price)}</td>
                          <td className="px-4 py-3 text-right text-[#111827]">{active ? formatUsd(currentPrice) : '—'}</td>
                          <td className="px-4 py-3 text-right text-[#111827]">{active ? formatUsd(value) : '—'}</td>
                          <td className="px-4 py-3">
                            {active ? (
                              renderSellControl(p)
                            ) : (
                              <span className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Closed</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden grid grid-cols-1 gap-4">
                {filteredPositions.map((p) => {
                  const { label, currentPrice, value, active } = getPositionPrices(p)
                  return (
                    <div key={p.id} className="rounded-xl border border-[#E5E7EB] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-[#111827]">{p.market_title}</p>
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                            label === 'YES'
                              ? 'bg-[#10B981]/10 text-[#10B981]'
                              : 'bg-[#EF4444]/10 text-[#EF4444]'
                          }`}
                        >
                          {p.option_label}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Avg Price</p>
                          <p className="font-medium text-[#111827]">{formatUsd(p.avg_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Current Price</p>
                          <p className="font-medium text-[#111827]">{active ? formatUsd(currentPrice) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Value</p>
                          <p className="font-medium text-[#111827]">{active ? formatUsd(value) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Shares</p>
                          <p className="font-medium text-[#111827]">{formatShares(p.shares)}</p>
                        </div>
                      </div>
                      {active && renderSellControl(p)}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
