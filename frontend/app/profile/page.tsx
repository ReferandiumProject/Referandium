'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePrivy, useFundWallet, useHeadlessDelegatedActions } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { Decimal } from '@/lib/decimal'

type Balance = {
  available_usdc: number
  locked_usdc: number
}

type DepositInfo = {
  platform_address: string
  usdc_mint: string
}

type VotePosition = {
  startup_id: string
  name: string
  slug: string
  logo_url: string | null
  phase: number
  total_yes_votes: number
  total_no_votes: number
  vote_threshold: number
  net: number
  progress: number
  direction: 'yes' | 'no'
  votes: number
  burned_at?: string | null
}

type VoteState = {
  balance: {
    grant_date: string | null
    granted_today: number
    remaining_today: number
    newly_granted: boolean
    pool_balance: number
    total_spendable: number
  }
  active: VotePosition[]
  burned: VotePosition[]
}

type CurveHolding = {
  startup_id: string
  name: string
  slug: string
  logo_url: string | null
  phase: number
  tokens: string
  cost_basis: string
  current_price: string
  pool_usdc: string
  capital_target: string
  progress: number
  graduated: boolean
  frozen: boolean
  spot_value_estimate: string
}

const formatUsd = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '—'
}

const formatVotes = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? v.toLocaleString() : '—'
}

const formatTokens = (s: string | null | undefined) => {
  if (!s) return '—'
  try {
    return Decimal.parse(String(s)).toString()
  } catch {
    return String(s)
  }
}

const formatUsdDecimal = (s: string | null | undefined) => {
  if (!s) return '—'
  try {
    return `$${Decimal.parse(String(s)).toFixed(2)}`
  } catch {
    return `$${s}`
  }
}

const decimalUsd = (s: string | null | undefined) => {
  try {
    return Decimal.parse(String(s ?? 0))
  } catch {
    return new Decimal(BigInt(0), 2)
  }
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#3B82F6] text-sm font-bold text-white">
      {getInitials(name)}
    </div>
  )
}

export default function ProfilePage() {
  const { authenticated, getAccessToken, login, user } = usePrivy()
  const { dbUser } = useUser()
  const { fundWallet } = useFundWallet({
    onUserExited: () => console.log('[Privy] card funding flow exited'),
  })
  const { delegateWallet } = useHeadlessDelegatedActions()

  const [balance, setBalance] = useState<Balance | null>(null)
  const [voteState, setVoteState] = useState<VoteState | null>(null)
  const [holdings, setHoldings] = useState<CurveHolding[] | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [depositMode, setDepositMode] = useState<'devnet' | 'wallet' | 'card'>('devnet')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [depositSig, setDepositSig] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [copied, setCopied] = useState(false)
  const [delegating, setDelegating] = useState(false)
  const [delegationError, setDelegationError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  const fetchProfile = async () => {
    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [balanceRes, voteRes, holdingsRes] = await Promise.all([
        fetch('/api/balance', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/startup-votes/mine', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/curve/mine', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const balanceJson = await balanceRes.json().catch(() => ({}))
      const voteJson = await voteRes.json().catch(() => ({}))
      const holdingsJson = await holdingsRes.json().catch(() => ({}))

      if (!balanceRes.ok) {
        setError(balanceJson.error || 'Failed to load balance')
      } else {
        setBalance(balanceJson.data || null)
      }

      if (!voteRes.ok) {
        setError((prev) => prev || voteJson.error || 'Failed to load votes')
      } else {
        setVoteState({
          balance: voteJson.balance,
          active: voteJson.active || [],
          burned: voteJson.burned || [],
        })
      }

      if (!holdingsRes.ok) {
        setError((prev) => prev || holdingsJson.error || 'Failed to load token holdings')
      } else {
        setHoldings(holdingsJson.holdings || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const fetchHoldings = async () => {
    const token = await getAccessToken()
    if (!token) return

    setHoldingsLoading(true)
    try {
      const res = await fetch('/api/curve/mine', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((prev) => prev || json.error || 'Failed to load token holdings')
      } else {
        setHoldings(json.holdings || [])
      }
    } catch (err: any) {
      setError((prev) => prev || err.message || 'Failed to load token holdings')
    } finally {
      setHoldingsLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) {
      fetchProfile()
    }
  }, [authenticated, getAccessToken])

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

  const depositLabels: Record<'devnet' | 'wallet' | 'card', string> = {
    devnet: 'Devnet Faucet',
    wallet: 'Wallet Deposit',
    card: 'Card',
  }

  const depositAddress = useMemo(() => {
    const account = user?.linkedAccounts?.find(
      (a: any) =>
        a.type === 'wallet' &&
        a.chainType === 'solana' &&
        a.walletClientType === 'privy'
    )
    return (account as any)?.address as string | undefined
  }, [user])

  const isEnabled = useMemo(() => {
    if (!user?.linkedAccounts || !depositAddress) return false
    const account = user.linkedAccounts.find(
      (a: any) => a.type === 'wallet' && a.address === depositAddress
    )
    return (account as any)?.delegated === true
  }, [user, depositAddress])

  useEffect(() => {
    setEnabled(isEnabled)
  }, [isEnabled])

  if (!authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-semibold text-[#111827]">Profile</h1>
          <p className="mb-6 text-sm text-[#6B7280]">
            Sign in to view your balance, voting power, and token holdings.
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
      <div className="mx-auto max-w-5xl">
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
              <h1 className="text-2xl font-semibold text-[#111827]">Profile</h1>
              <p className="mt-1 text-sm text-[#6B7280]">Manage your balance and votes</p>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Available USDC</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(balance?.available_usdc)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Locked USDC</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(balance?.locked_usdc)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Daily votes remaining</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">
                {voteState ? formatVotes(voteState.balance.remaining_today) : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Vote pool</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">
                {voteState ? formatVotes(voteState.balance.pool_balance) : '—'}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Voting power</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Votes are free tokens, not USDC. The daily grant resets each day if unused,
            while the pool holds votes you previously withdrew and never expires.
          </p>
          {voteState ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Today&apos;s grant</p>
                <p className="mt-1 text-2xl font-semibold text-[#111827]">
                  {formatVotes(voteState.balance.remaining_today)}
                  <span className="ml-1 text-sm font-normal text-[#6B7280]">
                    / {formatVotes(voteState.balance.granted_today)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  100 free tokens added each day. Use them or lose them by end of day.
                </p>
              </div>
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Pool balance</p>
                <p className="mt-1 text-2xl font-semibold text-[#111827]">
                  {formatVotes(voteState.balance.pool_balance)}
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Votes withdrawn from startups. They never expire and can be redeployed any time.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#6B7280]">Loading votes...</p>
          )}
        </section>

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[#111827]">Active votes</h2>
          {voteState === null ? (
            <p className="text-sm text-[#6B7280]">Loading active votes...</p>
          ) : voteState.active.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 text-center">
              <p className="text-sm text-[#6B7280]">
                You are not currently backing any startups.
              </p>
              <Link
                href="/"
                className="mt-3 inline-block text-sm font-semibold text-[#3B82F6] hover:text-blue-700"
              >
                Browse startups to start voting
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {voteState.active.map((pos) => (
                <Link
                  key={pos.startup_id}
                  href={`/startup/${pos.slug}`}
                  className="flex flex-col gap-4 rounded-lg border border-[#E5E7EB] p-4 transition-colors hover:bg-[#F9FAFB] sm:flex-row sm:items-center"
                >
                  <Avatar name={pos.name} src={pos.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-[#111827]">{pos.name}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                          pos.direction === 'yes'
                            ? 'bg-[#10B981]/10 text-[#10B981]'
                            : 'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}
                      >
                        {pos.direction}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {formatVotes(pos.votes)} votes · net {formatVotes(pos.net)} /{' '}
                      {formatVotes(pos.vote_threshold)}
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                      <div
                        className="h-full bg-[#3B82F6]"
                        style={{ width: `${Math.min(100, Math.max(0, pos.progress))}%` }}
                      />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[#111827]">Token holdings</h2>
            <p className="text-sm text-[#6B7280]">
              Startup tokens you bought with real money. These are positions in active or completed raises, not voting tokens.
            </p>
          </div>

          {holdings === null || holdingsLoading ? (
            <p className="text-sm text-[#6B7280]">Loading token holdings...</p>
          ) : holdings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 text-center">
              <p className="text-sm text-[#6B7280]">You don&apos;t hold any startup tokens yet.</p>
              <Link
                href="/"
                className="mt-3 inline-block text-sm font-semibold text-[#3B82F6] hover:text-blue-700"
              >
                Browse startups
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {holdings.map((h) => {
                const cost = decimalUsd(h.cost_basis)
                const spot = decimalUsd(h.spot_value_estimate)
                const gainLoss = spot.sub(cost)
                const zeroDecimal = new Decimal(BigInt(0), 0)
                const isGain = gainLoss.cmp(zeroDecimal) > 0
                const isLoss = gainLoss.cmp(zeroDecimal) < 0
                const gainLossAbs =
                  gainLoss.value < BigInt(0)
                    ? new Decimal(-gainLoss.value, gainLoss.scale)
                    : gainLoss

                let percentChange = zeroDecimal
                if (!cost.isZero()) {
                  percentChange = gainLoss.div(cost, 6).mul(Decimal.parse('100'), 6)
                }

                return (
                  <Link
                    key={h.startup_id}
                    href={`/startup/${h.slug}`}
                    className="flex flex-col gap-4 rounded-lg border border-[#E5E7EB] p-4 transition-colors hover:bg-[#F9FAFB] sm:flex-row sm:items-start"
                  >
                    <Avatar name={h.name} src={h.logo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-[#111827]">{h.name}</p>
                        {h.graduated && (
                          <span className="inline-flex rounded-full bg-[#10B981]/10 px-2 py-0.5 text-xs font-semibold text-[#10B981]">
                            Raise completed
                          </span>
                        )}
                        {h.frozen && (
                          <span className="inline-flex rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-xs font-semibold text-[#B45309]">
                            Halted
                          </span>
                        )}
                      </div>

                      {h.graduated && (
                        <p className="mt-1 text-xs text-[#10B981]">
                          The raise completed and the on-chain token is being prepared.
                        </p>
                      )}
                      {h.frozen && !h.graduated && (
                        <p className="mt-1 text-xs text-[#B45309]">
                          Trading is halted. Selling is still possible.
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-[#6B7280]">Tokens</p>
                          <p className="font-medium text-[#111827]">{formatTokens(h.tokens)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6B7280]">Current price</p>
                          <p className="font-medium text-[#111827]">{formatUsdDecimal(h.current_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6B7280]">Cost basis</p>
                          <p className="font-medium text-[#111827]">{formatUsdDecimal(h.cost_basis)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6B7280]">Estimated value</p>
                          <p className="font-medium text-[#111827]">{formatUsdDecimal(h.spot_value_estimate)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-xs text-[#6B7280]">vs cost basis:</span>
                        <span
                          className={`font-semibold ${
                            isGain ? 'text-[#10B981]' : isLoss ? 'text-[#EF4444]' : 'text-[#6B7280]'
                          }`}
                        >
                          {isGain ? '+' : isLoss ? '-' : ''}
                          {formatUsdDecimal(gainLossAbs.toString())}
                        </span>
                        {!cost.isZero() && (
                          <span
                            className={`text-xs ${
                              isGain ? 'text-[#10B981]' : isLoss ? 'text-[#EF4444]' : 'text-[#6B7280]'
                            }`}
                          >
                            ({isGain ? '+' : ''}
                            {percentChange.toString()})
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-xs italic text-[#9CA3AF]">
                        Estimated value is not a cash-out amount. Selling moves the price down the curve, so a large holding may realise less.
                      </p>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-[#6B7280]">
                          <span>Raise progress</span>
                          <span>{Math.round(h.progress * 100)}%</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div
                            className="h-full bg-[#3B82F6]"
                            style={{ width: `${Math.min(100, Math.max(0, h.progress * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Past votes</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Startups you backed that reached their vote threshold and moved on to raising capital.
            Those votes were consumed as part of the community validation.
          </p>
          {voteState === null ? (
            <p className="text-sm text-[#6B7280]">Loading past votes...</p>
          ) : voteState.burned.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No startups have crossed the threshold with your support yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {voteState.burned.map((pos) => (
                <Link
                  key={pos.startup_id}
                  href={`/startup/${pos.slug}`}
                  className="flex flex-col gap-4 rounded-lg border border-[#E5E7EB] p-4 transition-colors hover:bg-[#F9FAFB] sm:flex-row sm:items-center"
                >
                  <Avatar name={pos.name} src={pos.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-[#111827]">{pos.name}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                          pos.direction === 'yes'
                            ? 'bg-[#10B981]/10 text-[#10B981]'
                            : 'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}
                      >
                        {pos.direction}
                      </span>
                      <span className="inline-flex rounded-full bg-[#10B981]/10 px-2 py-0.5 text-xs font-semibold text-[#10B981]">
                        Validated
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {formatVotes(pos.votes)} votes contributed · threshold reached
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
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
            <div className="flex flex-col gap-4">
              {depositAddress ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex-1 overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
                      <p className="font-mono text-sm text-[#111827] break-all">{depositAddress}</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(depositAddress)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        } catch {
                          setMessage('Failed to copy address')
                        }
                      }}
                      className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    This is your personal Solana deposit address. Send USDC (Solana) here and funds will be detected and swept into your platform balance automatically.
                  </p>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      disabled={!depositAddress || delegating || enabled}
                      onClick={async () => {
                        if (!depositAddress) return
                        setDelegating(true)
                        setDelegationError(null)
                        try {
                          await delegateWallet({ address: depositAddress, chainType: 'solana' })
                          setEnabled(true)
                        } catch (err: any) {
                          setDelegationError(err.message || 'Failed to enable automatic deposits')
                        } finally {
                          setDelegating(false)
                        }
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                        enabled
                          ? 'bg-[#10B981] hover:bg-green-600'
                          : 'bg-[#3B82F6] hover:bg-blue-600'
                      } ${(!depositAddress || delegating || enabled) ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {enabled ? 'Enabled ✓' : delegating ? 'Enabling...' : 'Enable automatic deposits'}
                    </button>
                    <p className="text-xs text-[#6B7280]">
                      Allow the app to automatically move USDC from your deposit address into the platform, so you don&apos;t have to submit anything manually.
                    </p>
                  </div>
                  {delegationError && (
                    <p className="mt-2 text-xs text-[#EF4444]">{delegationError}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[#6B7280]">Your deposit address is being set up, refresh shortly.</p>
              )}

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
      </div>
    </main>
  )
}
