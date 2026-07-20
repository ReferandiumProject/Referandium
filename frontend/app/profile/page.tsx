'use client'

import { useEffect, useState } from 'react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { getPrice, getSellProceeds, getSharesForSellProceeds } from '../../lib/lmsr'
import { useUser } from '../context/UserContext'

type Position = {
  id: string
  market_id: string
  option_id: string
  market_title: string
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

export default function ProfilePage() {
  const { authenticated, getAccessToken, login } = usePrivy()
  const { dbUser } = useUser()
  const { fundWallet } = useFundWallet({
    onUserExited: () => console.log('[Privy] card funding flow exited'),
  })

  const [balance, setBalance] = useState<Balance | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [sellAmounts, setSellAmounts] = useState<Record<string, string>>({})
  const [sellResponses, setSellResponses] = useState<Record<string, string>>({})
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [marketDetails, setMarketDetails] = useState<Record<string, { qYes: number; qNo: number }>>({})

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

  if (!authenticated) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-4"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <div className="w-full max-w-md rounded-2xl border border-[#2A2A2A] bg-[#161616] p-8 text-center">
          <h1 className="mb-2 text-3xl font-semibold text-white">Profile</h1>
          <p className="mb-6 text-sm text-[#9CA3AF]">
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
    <main
      className="min-h-screen bg-[#0A0A0A] px-4 pb-24 pt-8 text-white"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-semibold text-white sm:text-3xl">
          Profile
        </h1>

        {loading && (
          <p className="mb-4 text-sm text-[#9CA3AF]">Loading profile...</p>
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

        <section className="mb-6 rounded-2xl border border-[#2A2A2A] bg-[#161616] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Balance</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#6B7280]">
                Available
              </p>
              <p className="text-xl font-medium text-white">
                {balance ? `${balance.available_usdc} USDC` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[#6B7280]">
                Locked
              </p>
              <p className="text-xl font-medium text-white">
                {balance ? `${balance.locked_usdc} USDC` : '—'}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-[#2A2A2A] bg-[#161616] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Deposit</h2>
          <select
            value={depositMode}
            onChange={(e) =>
              setDepositMode(e.target.value as 'devnet' | 'wallet' | 'card')
            }
            className="mb-4 w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none sm:w-auto"
          >
            <option value="devnet">Devnet Faucet</option>
            <option value="wallet">Wallet Deposit</option>
            <option value="card">Buy USDC with Card</option>
          </select>

          {depositMode === 'devnet' ? (
            <form
              onSubmit={handleDevnetDeposit}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input
                type="number"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount USDC"
                className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-[#6B7280] focus:border-[#3B82F6] focus:outline-none sm:w-48"
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
                <div className="mt-4 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4">
                  <p className="mb-2 text-xs text-[#9CA3AF] break-all">
                    <span className="text-[#6B7280]">Address:</span>{' '}
                    {depositInfo.platform_address}
                  </p>
                  <p className="mb-4 text-xs text-[#9CA3AF] break-all">
                    <span className="text-[#6B7280]">USDC Mint:</span>{' '}
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
                      className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-[#6B7280] focus:border-[#3B82F6] focus:outline-none sm:flex-1"
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
                  className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-[#6B7280] focus:border-[#3B82F6] focus:outline-none sm:w-48"
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
                Funds go to your embedded Solana wallet. After they arrive, use
                the Wallet Deposit flow to credit your platform balance.
              </p>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-[#2A2A2A] bg-[#161616] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Withdraw</h2>
          <form
            onSubmit={handleWithdraw}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="number"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount USDC"
              className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-[#6B7280] focus:border-[#3B82F6] focus:outline-none sm:w-48"
            />
            <input
              type="text"
              value={withdrawWallet}
              onChange={(e) => setWithdrawWallet(e.target.value)}
              placeholder="Destination wallet address"
              className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-[#6B7280] focus:border-[#3B82F6] focus:outline-none sm:flex-1"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
            >
              Withdraw
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Positions</h2>
          {positions === null ? (
            <p className="text-sm text-[#9CA3AF]">Loading positions...</p>
          ) : positions.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No positions</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {positions.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-sm font-medium text-white sm:text-base">
                      {p.market_title}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                        (p.option_label ?? '').toUpperCase() === 'YES'
                          ? 'bg-[#10B981]/10 text-[#10B981]'
                          : 'bg-[#EF4444]/10 text-[#EF4444]'
                      }`}
                    >
                      {p.option_label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm text-[#9CA3AF]">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#6B7280]">
                        Shares
                      </p>
                      <p className="text-white">
                        {p.shares}
                        {(() => {
                          const md = marketDetails[p.market_id]
                          if (!md) return null
                          const label = (p.option_label ?? '').toUpperCase() as 'YES' | 'NO'
                          const price = getPrice(md.qYes, md.qNo, label)
                          const value = p.shares * price
                          if (!Number.isFinite(value)) return null
                          return (
                            <span className="ml-1 text-[#9CA3AF]">
                              (~${value.toFixed(2)})
                            </span>
                          )
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#6B7280]">
                        Avg Price
                      </p>
                      <p className="text-white">{p.avg_price}</p>
                    </div>
                  </div>

                  {p.shares > 0 ? (
                    <div className="mt-4">
                      <label className="mb-1.5 block text-xs text-[#9CA3AF]">
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
                          className="w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-[#6B7280] focus:border-[#3B82F6] focus:outline-none sm:w-40"
                        />
                        <button
                          onClick={() => handleSell(p)}
                          className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors sm:w-auto ${
                            confirmingId === p.id
                              ? 'bg-[#EF4444] hover:bg-red-600'
                              : 'bg-[#3B82F6] hover:bg-blue-600'
                          }`}
                        >
                          {confirmingId === p.id ? 'Confirm Sell?' : 'Sell'}
                        </button>
                      </div>
                      {(() => {
                        const md = marketDetails[p.market_id]
                        const dollars = parseFloat(sellAmounts[p.id] ?? '0')
                        let estimate: string | null = null
                        if (md && dollars > 0) {
                          const label = (p.option_label ?? '').toUpperCase() as 'YES' | 'NO'
                          const est = getSharesForSellProceeds(md.qYes, md.qNo, label, dollars)
                          if (Number.isFinite(est) && est > 0) {
                            estimate = `≈ ${est.toFixed(2)} shares`
                          }
                        }
                        return (
                          <>
                            {estimate && (
                              <p className="mt-2 text-xs text-[#9CA3AF]">
                                {estimate}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-[#6B7280]">
                              Final amount may differ after 0.5% fee.
                            </p>
                            {sellResponses[p.id] && (
                              <p className="mt-2 text-xs text-[#9CA3AF]">
                                {sellResponses[p.id]}
                              </p>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[#9CA3AF]">No shares to sell</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
