'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/app/context/UserContext'
import { StartupGraduationClaim } from '@/app/components/StartupGraduationClaim'
import { GraduationReport } from '@/app/components/GraduationReport'
import type { GraduationReport as GraduationReportType } from '@/app/components/GraduationReport'
import { Decimal } from '@/lib/decimal'
import { formatUsd, formatTokenAmount, formatPrice, formatVoteCount } from '@/lib/format'
import { CurvePriceChart } from '@/app/components/CurvePriceChart'
import type { CurveOHLCPoint } from '@/lib/curve-time-series'
import { Badge, Button, Card, CountUp, Logo, Notice, Progress, Skeleton, SplitBar, buttonClass, cx, inputClass } from '@/app/components/ui'

type CurveState = {
  startup_id: string
  name: string
  slug: string
  pool_usdc: string
  current_price: string
  progress: number
  capital_target: string
  graduated: boolean
  frozen: boolean
  pool_address?: string | null
  graduation_status?: string | null
  user_holding?: { tokens: string; cost_basis: string } | null
  available_usdc?: string | null
}

type UserPosition = {
  direction: 'yes' | 'no'
  votes: number
}

type Startup = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  total_yes_votes: number
  total_no_votes: number
  vote_threshold: number
  net: number
  progress: number
  phase: number
  capital_target: number | null
  owner_id: string
  user_position?: UserPosition | null
}

type Balance = {
  grant_date: string
  granted_today: number
  remaining_today: number
  newly_granted: boolean
  pool_balance: number
  total_spendable: number
}

function decimalIsZero(s: string): boolean {
  try {
    return Decimal.parse(s).isZero()
  } catch {
    return true
  }
}

function sanitizeUsdcInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) return `${parts[0]}.${parts[1].slice(0, 6)}`
  if (parts.length === 2) return `${parts[0]}.${parts[1].slice(0, 6)}`
  return cleaned
}

function sanitizeTokenInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) return `${parts[0]}.${parts[1].slice(0, 18)}`
  if (parts.length === 2) return `${parts[0]}.${parts[1].slice(0, 18)}`
  return cleaned
}

// Candidate "quick buy" amounts, largest-first. Never shown as-is —
// only the ones that fit under the current cap (min of available
// balance and USDC remaining before the raise hits its target) are
// used, so a $50-target raise never offers a nonsensical $1,000
// button. If nothing on the ladder fits, the caller shows no presets
// at all rather than clamping a hardcoded amount down to something
// tiny and confusing.
const BUY_PRESET_LADDER = ['1', '2', '5', '10', '25', '50', '100', '250', '500', '1000', '2500', '5000', '10000']
const MAX_BUY_PRESETS = 4

function computeBuyPresets(cap: Decimal): Decimal[] {
  if (cap.isZero() || cap.value < BigInt(0)) return []
  const fits = BUY_PRESET_LADDER.map((s) => Decimal.parse(s)).filter((d) => d.lte(cap))
  return fits.slice(-MAX_BUY_PRESETS)
}

// Fixed ratio strings for the percentage-fill buttons, multiplied
// through Decimal (never a JS number) to avoid float rounding on
// financial amounts. 100% is always handled separately by callers,
// using the exact source string rather than a multiplication result.
const PERCENT_RATIOS = { 25: '0.25', 50: '0.5', 75: '0.75' } as const

function Tally({ yes, no }: { yes: number; no: number }) {
  const total = yes + no
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">Yes</p>
          <CountUp value={yes} format={formatVoteCount} className="font-display text-[36px] font-semibold leading-none tracking-tight text-yes" />
        </div>
        <p className="num hidden pb-0.5 sm:block text-[13px] text-muted">
          {total > 0 ? `${yesPct}% yes of ${formatVoteCount(total)} votes` : 'No votes yet'}
        </p>
        <div className="text-right">
          <p className="text-[13px] text-muted">No</p>
          <CountUp value={no} format={formatVoteCount} className="font-display text-[36px] font-semibold leading-none tracking-tight text-no" />
        </div>
      </div>
      <SplitBar yes={yes} no={no} className="h-3" />
      <p className="num mt-2 text-[13px] text-muted sm:hidden">
        {total > 0 ? `${yesPct}% yes of ${formatVoteCount(total)} votes` : 'No votes yet'}
      </p>
    </div>
  )
}

function ThresholdProgress({ progress, net, threshold }: { progress: number; net: number; threshold: number }) {
  return (
    <div>
      <div className="num mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">
          <span className="font-semibold text-ink">{Math.round(progress)}%</span> to the raise threshold
        </span>
        <span className="text-muted">
          {formatVoteCount(net)} / {formatVoteCount(threshold)} net votes
        </span>
      </div>
      <Progress value={progress} tone="neutral" />
    </div>
  )
}

function RaiseProgressBar({
  progress,
  raised,
  target,
}: {
  progress: number
  raised: string
  target: string
}) {
  return (
    <div>
      <div className="num mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-[22px] font-semibold tracking-tight text-ink">{formatUsd(raised)}</span>
        <span className="text-muted">
          {Math.round(progress)}% of {formatUsd(target)}
        </span>
      </div>
      <Progress value={progress} tone="accent" className="h-2" />
    </div>
  )
}

function VotePanel({
  startup,
  balance,
  isOwner,
  onCast,
  onFlip,
  onWithdraw,
  loading,
  error,
  success,
}: {
  startup: Startup
  balance: Balance | null
  isOwner: boolean
  onCast: (direction: 'yes' | 'no', votes: number) => Promise<void>
  onFlip: () => Promise<void>
  onWithdraw: (votes: number) => Promise<void>
  loading: boolean
  error: string | null
  success: string | null
}) {
  const { authenticated, login } = usePrivy()

  if (!authenticated) {
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Vote on this startup</h3>
        <p className="mt-1 text-sm text-muted">
          Sign in to get free daily voting tokens and vote yes or no.
        </p>
        <Button onClick={() => login()} className="mt-4 w-full">
          Sign in to vote
        </Button>
      </Card>
    )
  }

  if (startup.phase !== 1) {
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Voting is closed</h3>
        <p className="mt-1 text-sm text-muted">
          This startup passed community validation and has moved on to raising capital.
        </p>
      </Card>
    )
  }

  if (authenticated && isOwner) {
    return (
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">This is your listing</h3>
        <p className="mt-1 text-sm text-muted">
          Founders can&apos;t vote on their own startup, so validation stays with the community.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      {success && (
        <Notice tone="yes" className="mb-4">
          {success}
        </Notice>
      )}
      {error && (
        <Notice tone="no" className="mb-4">
          {error}
        </Notice>
      )}

      {!startup.user_position ? (
        <NewPositionForm
          balance={balance}
          onCast={onCast}
          loading={loading}
        />
      ) : (
        <ExistingPositionForm
          position={startup.user_position}
          balance={balance}
          onCast={onCast}
          onFlip={onFlip}
          onWithdraw={onWithdraw}
          loading={loading}
        />
      )}
    </Card>
  )
}

function NewPositionForm({
  balance,
  onCast,
  loading,
}: {
  balance: Balance | null
  onCast: (direction: 'yes' | 'no', votes: number) => Promise<void>
  loading: boolean
}) {
  const [direction, setDirection] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')

  const totalSpendable = balance?.total_spendable ?? 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const votes = Math.floor(Number(amount))
    if (!votes || votes <= 0) return
    await onCast(direction, Math.min(votes, totalSpendable))
    setAmount('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 className="text-[15px] font-semibold">Cast your vote</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        You get 100 free voting tokens a day; unused ones expire at midnight. Votes you withdraw
        from other startups stay in your pool and can be used here.
      </p>

      <div className="relative mt-5 grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1" role="radiogroup" aria-label="Vote direction">
        <span
          aria-hidden="true"
          className={cx(
            'absolute bottom-1 left-1 top-1 w-[calc(50%-6px)] rounded-lg transition-all duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
            direction === 'yes' ? 'translate-x-0 bg-yes shadow-[0_6px_18px_-6px_rgb(14_159_110/0.7)]' : 'translate-x-[calc(100%+8px)] bg-no shadow-[0_6px_18px_-6px_rgb(240_68_97/0.7)]',
          )}
        />
        <button
          type="button"
          role="radio"
          aria-checked={direction === 'yes'}
          onClick={() => setDirection('yes')}
          className={cx(
            'relative z-10 h-10 rounded-lg text-sm font-semibold transition-colors duration-300',
            direction === 'yes' ? 'text-white' : 'text-muted hover:text-ink',
          )}
        >
          Yes, back it
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={direction === 'no'}
          onClick={() => setDirection('no')}
          className={cx(
            'relative z-10 h-10 rounded-lg text-sm font-semibold transition-colors duration-300',
            direction === 'no' ? 'text-white' : 'text-muted hover:text-ink',
          )}
        >
          No, reject it
        </button>
      </div>

      <label htmlFor="vote-amount" className="mb-1.5 mt-4 flex items-baseline justify-between text-sm font-medium">
        Votes
        <span className="num text-[13px] font-normal text-muted">{formatVoteCount(totalSpendable)} available</span>
      </label>
      <input
        id="vote-amount"
        type="number"
        min={1}
        max={totalSpendable}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className={cx(inputClass, 'num h-11 text-lg font-semibold')}
      />

      <button
        type="submit"
        disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > totalSpendable}
        className={buttonClass(direction === 'yes' ? 'yes' : 'no', 'lg', 'mt-4 w-full')}
      >
        {loading ? 'Submitting…' : direction === 'yes' ? 'Vote yes' : 'Vote no'}
      </button>
    </form>
  )
}

function ExistingPositionForm({
  position,
  balance,
  onCast,
  onFlip,
  onWithdraw,
  loading,
}: {
  position: UserPosition
  balance: Balance | null
  onCast: (direction: 'yes' | 'no', votes: number) => Promise<void>
  onFlip: () => Promise<void>
  onWithdraw: (votes: number) => Promise<void>
  loading: boolean
}) {
  const [mode, setMode] = useState<'add' | 'withdraw' | null>(null)
  const [amount, setAmount] = useState('')

  const totalSpendable = balance?.total_spendable ?? 0

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const votes = Math.floor(Number(amount))
    if (!votes || votes <= 0) return
    await onCast(position.direction, Math.min(votes, totalSpendable))
    setAmount('')
    setMode(null)
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    const votes = Math.floor(Number(amount))
    if (!votes || votes <= 0) return
    await onWithdraw(Math.min(votes, position.votes))
    setAmount('')
    setMode(null)
  }

  const isYes = position.direction === 'yes'

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">Your vote</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="num font-semibold text-ink">{formatVoteCount(position.votes)}</span> votes on{' '}
            <span className={cx('font-semibold', isYes ? 'text-yes' : 'text-no')}>{isYes ? 'yes' : 'no'}</span>
          </p>
        </div>
        <Badge tone={isYes ? 'yes' : 'no'}>{isYes ? 'Backing' : 'Rejecting'}</Badge>
      </div>

      {mode === null ? (
        <div className="mt-5 grid gap-2">
          <Button onClick={() => setMode('add')} variant={isYes ? 'yes' : 'no'} size="lg" className="w-full">
            Add {isYes ? 'yes' : 'no'} votes
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onFlip()} disabled={loading} variant="secondary">
              Switch to {isYes ? 'no' : 'yes'}
            </Button>
            <Button onClick={() => setMode('withdraw')} variant="secondary">
              Withdraw votes
            </Button>
          </div>
        </div>
      ) : mode === 'add' ? (
        <form onSubmit={handleAdd} className="mt-5">
          <label htmlFor="vote-add" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
            More {isYes ? 'yes' : 'no'} votes
            <span className="num text-[13px] font-normal text-muted">{formatVoteCount(totalSpendable)} available</span>
          </label>
          <input
            id="vote-add"
            type="number"
            min={1}
            max={totalSpendable}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={cx(inputClass, 'num h-11 text-lg font-semibold')}
          />
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > totalSpendable}
              className={buttonClass(isYes ? 'yes' : 'no', 'lg', 'flex-1')}
            >
              {loading ? 'Adding…' : 'Add votes'}
            </button>
            <Button variant="ghost" size="lg" onClick={() => { setMode(null); setAmount('') }}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleWithdraw} className="mt-5">
          <label htmlFor="vote-withdraw" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
            Votes to withdraw
            <span className="num text-[13px] font-normal text-muted">{formatVoteCount(position.votes)} on this startup</span>
          </label>
          <input
            id="vote-withdraw"
            type="number"
            min={1}
            max={position.votes}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={cx(inputClass, 'num h-11 text-lg font-semibold')}
          />
          <p className="mt-1.5 text-[13px] text-muted">Withdrawn votes go back to your pool.</p>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > position.votes}
              className={buttonClass('primary', 'lg', 'flex-1')}
            >
              {loading ? 'Withdrawing…' : 'Withdraw'}
            </button>
            <Button variant="ghost" size="lg" onClick={() => { setMode(null); setAmount('') }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function solanaPoolExplorerLink(poolAddress: string | null | undefined): string | null {
  return poolAddress ? `https://explorer.solana.com/address/${poolAddress}?cluster=devnet` : null
}

function graduationStatusMessage(
  status: string | null | undefined,
  raised: string,
  target: string
): string {
  switch (status) {
    case 'complete':
      return `This startup raised ${formatUsd(raised)} of its ${formatUsd(
        target
      )} target. The token has been minted, the liquidity pool created, the LP tokens burned, the mint authority revoked, and the founder has been paid.`
    case 'revoking':
      return 'Mint authority is being revoked. This is the final step before the graduation is complete.'
    case 'founder_paid':
      return 'Founder payout is complete. Revoking the mint authority is the final step.'
    case 'paying_founder':
      return 'Founder payout is being processed.'
    case 'burned':
      return 'The LP tokens have been burned. Founder payout is next.'
    case 'burning':
      return 'The LP tokens are being burned.'
    case 'pooled':
      return 'The liquidity pool has been created. The LP tokens will be burned next.'
    case 'pooling':
      return 'The liquidity pool is being created on Raydium.'
    case 'minted':
      return 'The token has been minted. The liquidity pool is being created next.'
    case 'minting':
      return 'The token is being minted.'
    case 'halted':
      return 'Graduation is paused. The team will resume the process.'
    default:
      return `This startup raised ${formatUsd(raised)} of its ${formatUsd(
        target
      )} target. The token is being prepared for issuance.`
  }
}

function CurvePanel({
  curve,
  loading,
  error,
  success,
  onBuy,
  onSell,
}: {
  curve: CurveState
  loading: boolean
  error: string | null
  success: string | null
  onBuy: (usdc: string) => Promise<void>
  onSell: (tokens: string) => Promise<void>
}) {
  const { authenticated, login } = usePrivy()
  const hasHolding = !!curve.user_holding && !decimalIsZero(curve.user_holding.tokens)
  const [mode, setMode] = useState<'buy' | 'sell'>(hasHolding ? 'sell' : 'buy')
  const [buyAmount, setBuyAmount] = useState('')
  const [sellAmount, setSellAmount] = useState('')

  const buyEstimate = useMemo(() => {
    if (!buyAmount || decimalIsZero(buyAmount) || !curve.current_price) return null
    try {
      const gross = Decimal.parse(buyAmount)
      const fee = gross.mul(Decimal.parse('0.01'))
      const net = gross.sub(fee)
      return net.div(Decimal.parse(curve.current_price), 18)
    } catch {
      return null
    }
  }, [buyAmount, curve.current_price])

  const sellEstimate = useMemo(() => {
    if (!sellAmount || decimalIsZero(sellAmount) || !curve.current_price) return null
    try {
      const tokens = Decimal.parse(sellAmount)
      const gross = tokens.mul(Decimal.parse(curve.current_price))
      const fee = gross.mul(Decimal.parse('0.01'))
      return gross.sub(fee)
    } catch {
      return null
    }
  }, [sellAmount, curve.current_price])

  const handleBuyChange = (raw: string) => {
    const value = sanitizeUsdcInput(raw)
    if (!value) {
      setBuyAmount(value)
      return
    }
    if (!curve.available_usdc) {
      setBuyAmount(value)
      return
    }
    try {
      const entered = Decimal.parse(value)
      const max = Decimal.parse(curve.available_usdc)
      setBuyAmount(entered.gt(max) ? curve.available_usdc : value)
    } catch {
      setBuyAmount(value)
    }
  }

  const handleSellChange = (raw: string) => {
    const value = sanitizeTokenInput(raw)
    if (!value || !curve.user_holding) {
      setSellAmount(value)
      return
    }
    try {
      const entered = Decimal.parse(value)
      const max = Decimal.parse(curve.user_holding.tokens)
      setSellAmount(entered.gt(max) ? curve.user_holding.tokens : value)
    } catch {
      setSellAmount(value)
    }
  }

  // USDC still needed to hit the capital target, floored at zero.
  const remainingToTarget = useMemo(() => {
    try {
      const target = Decimal.parse(curve.capital_target)
      const pool = Decimal.parse(curve.pool_usdc)
      const diff = target.sub(pool)
      return diff.value < BigInt(0) ? new Decimal(BigInt(0), diff.scale) : diff
    } catch {
      return null
    }
  }, [curve.capital_target, curve.pool_usdc])

  // The ceiling for "quick buy" presets: never more than the user can
  // actually spend, and never more than the raise actually needs.
  const buyCap = useMemo(() => {
    let cap = remainingToTarget
    if (curve.available_usdc) {
      try {
        const avail = Decimal.parse(curve.available_usdc)
        cap = cap && cap.lt(avail) ? cap : avail
      } catch {
        // ignore malformed balance; fall back to remainingToTarget
      }
    }
    return cap
  }, [remainingToTarget, curve.available_usdc])

  const buyPresets = useMemo(() => (buyCap ? computeBuyPresets(buyCap) : []), [buyCap])

  const hasAvailableBalance = !!curve.available_usdc && !decimalIsZero(curve.available_usdc)

  const fillBuyPercent = (pct: 25 | 50 | 100) => {
    if (!curve.available_usdc) return
    if (pct === 100) {
      handleBuyChange(curve.available_usdc)
      return
    }
    try {
      const avail = Decimal.parse(curve.available_usdc)
      const amount = avail.mul(Decimal.parse(PERCENT_RATIOS[pct]))
      handleBuyChange(amount.toString())
    } catch {
      // ignore malformed balance; leave input unchanged
    }
  }

  const fillSellPercent = (pct: 25 | 50 | 75 | 100) => {
    if (!curve.user_holding) return
    if (pct === 100) {
      // Send the exact holding string, never a value re-derived by
      // multiplying — multiplying and rounding back can either
      // reject (asking to sell fractionally more than is held) or
      // strand dust behind.
      setSellAmount(curve.user_holding.tokens)
      return
    }
    try {
      const tokens = Decimal.parse(curve.user_holding.tokens)
      const amount = tokens.mul(Decimal.parse(PERCENT_RATIOS[pct]))
      handleSellChange(amount.toString())
    } catch {
      // ignore malformed holding; leave input unchanged
    }
  }

  const onSubmitBuy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buyAmount || decimalIsZero(buyAmount)) return
    await onBuy(buyAmount)
    setBuyAmount('')
  }

  const onSubmitSell = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sellAmount || decimalIsZero(sellAmount)) return
    await onSell(sellAmount)
    setSellAmount('')
  }

  const pillClass =
    'h-8 flex-1 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold text-ink-soft transition-all duration-150 hover:-translate-y-px hover:border-accent/40 hover:text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-45'

  return (
    <Card className="p-5">
      {success && (
        <Notice tone="yes" className="mb-4">
          {success}
        </Notice>
      )}
      {error && (
        <Notice tone="no" className="mb-4">
          {error.includes('Insufficient balance') || error.includes('No balance')
            ? `${error} Deposit more USDC to continue.`
            : error}
        </Notice>
      )}

      <div>
        <h3 className="text-[15px] font-semibold">Capital raise</h3>
        <p className="mt-1 text-sm text-muted">
          Buy tokens on a bonding curve until the raise reaches its target.
        </p>
        <div className="mt-4">
          <RaiseProgressBar
            progress={curve.progress}
            raised={curve.pool_usdc}
            target={curve.capital_target}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">
            {curve.graduated ? 'Final raise price' : 'Token price'}
          </span>
          <span className="num font-medium text-ink">${formatPrice(curve.current_price)}</span>
        </div>
        {curve.graduated && curve.pool_address && (
          <div className="mt-1 flex items-center justify-between text-[13px] text-muted">
            <span>Final bonding-curve price</span>
            <a
              href={solanaPoolExplorerLink(curve.pool_address)!}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              View Raydium pool
            </a>
          </div>
        )}
      </div>

      {hasHolding && curve.user_holding && (
        <div className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">You hold</span>
            <span className="num font-medium text-ink">{formatTokenAmount(curve.user_holding.tokens)} tokens</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[13px] text-muted">
            <span>Cost basis</span>
            <span className="num">{formatUsd(curve.user_holding.cost_basis)}</span>
          </div>
        </div>
      )}

      {authenticated === false && (
        <Button onClick={() => login()} size="lg" className="mt-5 w-full">
          Sign in to buy tokens
        </Button>
      )}

      {curve.graduated && (
        <Notice tone="yes" title="Raise complete" className="mt-5">
          {graduationStatusMessage(curve.graduation_status, curve.pool_usdc, curve.capital_target)}
        </Notice>
      )}

      {authenticated && !curve.graduated && curve.frozen && (
        <Notice tone="warn" className="mt-5">
          Trading is paused. New purchases are on hold, but holders can still sell.
        </Notice>
      )}

      {authenticated && !curve.graduated && (
        <div className="mt-5 border-t border-line pt-5">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'buy'}
              onClick={() => setMode('buy')}
              disabled={curve.frozen}
              className={cx(
                'h-8 rounded-lg text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45',
                mode === 'buy' ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-muted hover:text-ink',
              )}
            >
              Buy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'sell'}
              onClick={() => setMode('sell')}
              disabled={!hasHolding}
              className={cx(
                'h-8 rounded-lg text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45',
                mode === 'sell' ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-muted hover:text-ink',
              )}
            >
              Sell
            </button>
          </div>

          {mode === 'buy' ? (
            <form onSubmit={onSubmitBuy}>
              <label htmlFor="buy-amount" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
                You pay
                {curve.available_usdc && (
                  <span className="num text-[13px] font-normal text-muted">
                    {formatUsd(curve.available_usdc)} available
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold text-faint">
                  $
                </span>
                <input
                  id="buy-amount"
                  type="text"
                  inputMode="decimal"
                  value={buyAmount}
                  onChange={(e) => handleBuyChange(e.target.value)}
                  placeholder="0.00"
                  disabled={loading || curve.frozen}
                  className={cx(inputClass, 'num h-12 pl-7 text-xl font-semibold')}
                />
              </div>
              {(buyPresets.length > 0 || hasAvailableBalance) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {buyPresets.map((preset) => (
                    <button
                      key={preset.toString()}
                      type="button"
                      disabled={loading || curve.frozen}
                      onClick={() => handleBuyChange(preset.toString())}
                      className={pillClass}
                    >
                      ${preset.toString()}
                    </button>
                  ))}
                  {hasAvailableBalance &&
                    ([25, 50, 100] as const).map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={loading || curve.frozen}
                        onClick={() => fillBuyPercent(pct)}
                        className={pillClass}
                      >
                        {pct === 100 ? 'Max' : `${pct}%`}
                      </button>
                    ))}
                </div>
              )}
              {buyEstimate && (
                <div className="mt-4 space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted">You receive about</span>
                    <span className="num font-medium text-ink">{formatTokenAmount(buyEstimate.toString())} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Fee (1%)</span>
                    <span className="num text-ink">
                      {formatUsd(
                        Decimal.parse(buyAmount || '0')
                          .mul(Decimal.parse('0.01'))
                          .toString()
                      )}
                    </span>
                  </div>
                  <p className="pt-1 text-xs leading-snug text-faint">
                    The fee comes out of the amount you enter: spending 100 USDC puts 99 USDC into the raise.
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={
                  loading ||
                  curve.frozen ||
                  !buyAmount ||
                  decimalIsZero(buyAmount) ||
                  (curve.available_usdc
                    ? Decimal.parse(buyAmount).gt(Decimal.parse(curve.available_usdc))
                    : true)
                }
                className={buttonClass('accent', 'lg', 'mt-4 w-full')}
              >
                {loading ? 'Processing…' : 'Buy tokens'}
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmitSell}>
              <label htmlFor="sell-amount" className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
                You sell
                {hasHolding && curve.user_holding && (
                  <span className="num text-[13px] font-normal text-muted">
                    {formatTokenAmount(curve.user_holding.tokens)} held
                  </span>
                )}
              </label>
              <input
                id="sell-amount"
                type="text"
                inputMode="decimal"
                value={sellAmount}
                onChange={(e) => handleSellChange(e.target.value)}
                placeholder="0"
                disabled={loading}
                className={cx(inputClass, 'num h-12 text-xl font-semibold')}
              />
              <div className="mt-2 flex gap-1.5">
                {([25, 50, 75, 100] as const).map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={loading || !hasHolding}
                    onClick={() => fillSellPercent(pct)}
                    className={pillClass}
                  >
                    {pct === 100 ? 'Max' : `${pct}%`}
                  </button>
                ))}
              </div>
              {sellEstimate && (
                <div className="mt-4 space-y-1 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted">You receive about</span>
                    <span className="num font-medium text-ink">{formatUsd(sellEstimate.toString())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Fee (1%)</span>
                    <span className="num text-ink">
                      {formatUsd(
                        Decimal.parse(sellAmount || '0')
                          .mul(Decimal.parse(curve.current_price))
                          .mul(Decimal.parse('0.01'))
                          .toString()
                      )}
                    </span>
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={
                  loading ||
                  !sellAmount ||
                  decimalIsZero(sellAmount) ||
                  (curve.user_holding
                    ? Decimal.parse(sellAmount).gt(Decimal.parse(curve.user_holding.tokens))
                    : true)
                }
                className={buttonClass('primary', 'lg', 'mt-4 w-full')}
              >
                {loading ? 'Processing…' : 'Sell tokens'}
              </button>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

export default function StartupDetailPage() {
  const params = useParams() as { slug?: string } | null
  const slug = params?.slug ?? ''
  const { authenticated, getAccessToken, ready } = usePrivy()
  const { dbUser } = useUser()

  const [startup, setStartup] = useState<Startup | null>(null)
  const [startupLoading, setStartupLoading] = useState(true)
  const [startupError, setStartupError] = useState<string | null>(null)

  const [balance, setBalance] = useState<Balance | null>(null)

  const [curve, setCurve] = useState<CurveState | null>(null)
  const [curveLoading, setCurveLoading] = useState(false)
  const [curveError, setCurveError] = useState<string | null>(null)

  const [graduationReport, setGraduationReport] = useState<GraduationReportType | null>(null)
  const [graduationReportLoading, setGraduationReportLoading] = useState(false)
  const [graduationReportError, setGraduationReportError] = useState<string | null>(null)

  const [curveTrades, setCurveTrades] = useState<{
    ohlc: CurveOHLCPoint[]
    graduated: boolean
  } | null>(null)
  const [curveTradesLoading, setCurveTradesLoading] = useState(false)
  const [curveTradesError, setCurveTradesError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [thresholdNotice, setThresholdNotice] = useState<{ message: string } | null>(null)
  const [graduatedNotice, setGraduatedNotice] = useState<string | null>(null)
  const [pendingCurveTradeKey, setPendingCurveTradeKey] = useState<string | null>(null)
  const pendingCurveTradeKeyRef = useRef<string | null>(null)
  const [pendingVoteKey, setPendingVoteKey] = useState<string | null>(null)
  const pendingVoteKeyRef = useRef<string | null>(null)

  const authState = useMemo(
    () => (ready ? (authenticated ? 'auth' : 'anon') : 'pending'),
    [ready, authenticated]
  )

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    if (authenticated) {
      const token = await getAccessToken()
      if (!token) {
        // Privy still reports the session as authenticated but cannot mint a
        // token — it has expired. Fail loudly here so the user sees why the
        // action failed instead of an unexplained anonymous 401.
        throw new Error('Your session has expired, please sign in again')
      }
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async function fetchStartup() {
    setStartupLoading(true)
    setStartupError(null)

    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/startup-votes/${slug}`, { headers })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Failed to load startup (${res.status})`)
      }

      setStartup(data as Startup)
    } catch (err: any) {
      setStartupError(err.message || 'Failed to load startup')
    } finally {
      setStartupLoading(false)
    }
  }

  async function fetchBalance() {
    if (!authenticated) {
      setBalance(null)
      return
    }
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/startup-votes/balance', { headers })
      const data = await res.json()
      if (res.ok) {
        setBalance(data as Balance)
      }
    } catch (err) {
      console.error('[startup detail] balance fetch error:', err)
    }
  }

  useEffect(() => {
    if (authState === 'pending') return
    fetchStartup()
    fetchBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, slug])

  async function handleAction<T>(
    action: (idempotencyKey: string) => Promise<T>,
    successMessage: string,
    votesConsumed?: number
  ) {
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const idempotencyKey =
        pendingVoteKeyRef.current ?? (crypto as any).randomUUID()
      if (!pendingVoteKeyRef.current) {
        pendingVoteKeyRef.current = idempotencyKey
        setPendingVoteKey(idempotencyKey)
      }

      const result = await action(idempotencyKey)
      // Clear the key on any final 2xx so a later click is a new attempt.
      pendingVoteKeyRef.current = null
      setPendingVoteKey(null)

      const closed = (result as any)?.phase_closed === true
      if (closed) {
        const consumed = votesConsumed ?? 0
        setThresholdNotice({
          message:
            `This startup just reached its community threshold because of your action. ` +
            `Voting is now permanently closed. ` +
            (consumed > 0
              ? `The ${formatVoteCount(consumed)} votes you had deployed here were consumed as part of the community validation — `
              : `The votes you had deployed here were consumed as part of the community validation — `) +
            `this is the intended outcome of backing a startup that makes it through, not a penalty or an error.`,
        })
      } else {
        setActionSuccess(successMessage)
      }
      await fetchStartup()
      await fetchBalance()
    } catch (err: any) {
      setActionError(err.message || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function castVote(direction: 'yes' | 'no', votes: number, idempotencyKey: string) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/startup-votes/cast', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, direction, votes, idempotency_key: idempotencyKey }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Cast failed (${res.status})`)
    }
    return data
  }

  async function flipVote(idempotencyKey: string) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/startup-votes/flip', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, idempotency_key: idempotencyKey }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Flip failed (${res.status})`)
    }
    return data
  }

  async function withdrawVote(votes: number, idempotencyKey: string) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/startup-votes/withdraw', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, votes, idempotency_key: idempotencyKey }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Withdraw failed (${res.status})`)
    }
    return data
  }

  async function fetchCurve() {
    if (!slug) return
    setCurveLoading(true)
    setCurveError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/curve/${slug}`, { headers })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to load curve state (${res.status})`)
      }
      setCurve(data as CurveState)
    } catch (err: any) {
      setCurveError(err.message || 'Failed to load curve state')
    } finally {
      setCurveLoading(false)
    }
  }

  async function fetchGraduationReport() {
    if (!slug) return
    setGraduationReportLoading(true)
    setGraduationReportError(null)
    setGraduationReport(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/graduation-report/${slug}`, { headers })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to load graduation report (${res.status})`)
      }
      setGraduationReport(data as GraduationReportType)
    } catch (err: any) {
      setGraduationReportError(err.message || 'Failed to load graduation report')
    } finally {
      setGraduationReportLoading(false)
    }
  }

  async function fetchCurveTrades() {
    if (!slug) return
    setCurveTradesLoading(true)
    setCurveTradesError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/curve/${slug}/trades`, { headers })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to load curve trades (${res.status})`)
      }
      setCurveTrades(data)
    } catch (err: any) {
      setCurveTradesError(err.message || 'Failed to load curve trades')
    } finally {
      setCurveTradesLoading(false)
    }
  }

  async function buyTokens(usdc: string, idempotencyKey: string) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/curve/buy', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, usdc, idempotency_key: idempotencyKey }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Buy failed (${res.status})`)
    }
    return data
  }

  async function sellTokens(tokens: string, idempotencyKey: string) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/curve/sell', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, tokens, idempotency_key: idempotencyKey }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Sell failed (${res.status})`)
    }
    return data
  }

  async function handleCurveTrade<T>(
    action: (idempotencyKey: string) => Promise<T>,
    successMessage: string
  ) {
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)
    setGraduatedNotice(null)

    try {
      const idempotencyKey =
        pendingCurveTradeKeyRef.current ?? (crypto as any).randomUUID()
      if (!pendingCurveTradeKeyRef.current) {
        pendingCurveTradeKeyRef.current = idempotencyKey
        setPendingCurveTradeKey(idempotencyKey)
      }

      const result = await action(idempotencyKey)

      // Clear the key on any final 2xx so a later click is a new attempt.
      pendingCurveTradeKeyRef.current = null
      setPendingCurveTradeKey(null)

      if ((result as any)?.r_graduated) {
        setGraduatedNotice(
          'Your purchase completed the capital raise. The token is being prepared for issuance.'
        )
        await fetchStartup()
      } else {
        setActionSuccess(successMessage)
      }
      await fetchCurve()
      await fetchCurveTrades()
      await fetchBalance()
    } catch (err: any) {
      setActionError(err.message || 'Trade failed')
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (authState === 'pending') return
    setCurve(null)
    setCurveError(null)
    setGraduationReport(null)
    setGraduationReportError(null)
    if (startup && startup.phase !== 1) {
      fetchCurveTrades()
      if (startup.phase === 3) {
        fetchGraduationReport()
      } else {
        fetchCurve()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, slug, startup?.phase])

  if (startupLoading) {
    return (
      <div className="mx-auto w-full max-w-page px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <Skeleton className="mb-8 h-4 w-28" />
        <div className="mb-10 flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (startupError) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-xl font-semibold">Startup not found</h1>
        <p className="mt-2 text-sm text-muted">
          There is no startup at <span className="font-medium text-ink">/{slug}</span>. It may have been removed or renamed.
        </p>
        <Link href="/" className={buttonClass('primary', 'md', 'mt-6')}>
          Browse startups
        </Link>
      </div>
    )
  }

  if (!startup) return null

  const phaseBadge =
    startup.phase === 1 ? (
      <Badge>Voting</Badge>
    ) : startup.phase === 2 ? (
      <Badge tone="accent">Raising</Badge>
    ) : (
      <Badge tone="yes">Raise complete</Badge>
    )

  return (
    <div className="mx-auto w-full max-w-page px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All startups
      </Link>

      <header className="mt-6 flex items-start gap-4 sm:gap-5">
        <Logo name={startup.name} src={startup.logo_url} size={64} className="animate-scale-in rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">{startup.name}</h1>
            {phaseBadge}
          </div>
          {startup.description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{startup.description}</p>
          )}
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="stagger min-w-0 space-y-6">
          {thresholdNotice && (
            <Notice tone="yes">
              <div className="flex items-start justify-between gap-4">
                <p>{thresholdNotice.message}</p>
                <button type="button" onClick={() => setThresholdNotice(null)} className="shrink-0 font-medium hover:underline">
                  Dismiss
                </button>
              </div>
            </Notice>
          )}

          {graduatedNotice && (
            <Notice tone="yes">
              <div className="flex items-start justify-between gap-4">
                <p>{graduatedNotice}</p>
                <button type="button" onClick={() => setGraduatedNotice(null)} className="shrink-0 font-medium hover:underline">
                  Dismiss
                </button>
              </div>
            </Notice>
          )}

          {startup.phase !== 1 && (
            <Card>
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[15px] font-semibold">Price history</h2>
                <p className="mt-0.5 text-[13px] text-muted">Hourly candles of every trade on the bonding curve</p>
              </div>
              <div className="p-3 sm:p-5">
                {curveTradesLoading ? (
                  <Skeleton className="h-80 rounded-lg" />
                ) : curveTradesError ? (
                  <Notice tone="no">{curveTradesError}</Notice>
                ) : curveTrades ? (
                  <CurvePriceChart
                    {...curveTrades}
                    opening_pool_price={graduationReport?.opening_pool_price}
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-muted">No trades yet.</p>
                )}
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Community vote</h2>
              {startup.user_position && (
                <Badge tone={startup.user_position.direction === 'yes' ? 'yes' : 'no'}>
                  You voted {startup.user_position.direction === 'yes' ? 'yes' : 'no'} with{' '}
                  {formatVoteCount(startup.user_position.votes)}
                </Badge>
              )}
            </div>
            <Tally yes={startup.total_yes_votes} no={startup.total_no_votes} />
            {startup.phase === 1 ? (
              <div className="mt-6 border-t border-line pt-5">
                <ThresholdProgress
                  progress={startup.progress}
                  net={startup.net}
                  threshold={startup.vote_threshold}
                />
              </div>
            ) : (
              <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
                Voting closed when this startup reached its threshold. These are the final results.
              </p>
            )}
          </Card>
        </div>

        <aside className="min-w-0 animate-[fade-up_0.55s_0.15s_cubic-bezier(0.2,0.7,0.2,1)_backwards] lg:sticky lg:top-24">
            {startup.phase === 1 ? (
              <VotePanel
                startup={startup}
                balance={balance}
                isOwner={dbUser?.id === startup.owner_id}
                onCast={(direction, votes) => {
                  const prior = startup?.user_position?.votes ?? 0
                  return handleAction(
                    (idempotencyKey) => castVote(direction, votes, idempotencyKey),
                    `Votes cast successfully.`,
                    prior > 0 ? prior + votes : votes
                  )
                }}
                onFlip={() => {
                  const prior = startup?.user_position?.votes ?? 0
                  return handleAction((idempotencyKey) => flipVote(idempotencyKey), `Your position was flipped.`, prior)
                }}
                onWithdraw={(votes) => {
                  const prior = startup?.user_position?.votes ?? 0
                  return handleAction(
                    (idempotencyKey) => withdrawVote(votes, idempotencyKey),
                    `Votes withdrawn back to your pool.`,
                    prior
                  )
                }}
                loading={actionLoading}
                error={actionError}
                success={actionSuccess}
              />
            ) : startup.phase === 3 ? (
              graduationReportLoading ? (
                <Card className="space-y-3 p-5">
                  <Skeleton className="h-4" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-10" />
                </Card>
              ) : graduationReport ? (
                <GraduationReport
                  report={graduationReport}
                  startupName={startup.name}
                />
              ) : (
                <Notice tone="no">{graduationReportError || 'Could not load graduation report.'}</Notice>
              )
            ) : curveLoading || curveError ? (
              curveLoading ? (
                <Card className="space-y-3 p-5">
                  <Skeleton className="h-4" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-10" />
                </Card>
              ) : (
                <Notice tone="no">{curveError || 'Could not load capital raise data.'}</Notice>
              )
            ) : curve ? (
              <CurvePanel
                curve={curve}
                loading={actionLoading}
                error={actionError}
                success={actionSuccess}
                onBuy={(usdc) =>
                  handleCurveTrade((idempotencyKey) => buyTokens(usdc, idempotencyKey), 'Purchase confirmed.')
                }
                onSell={(tokens) =>
                  handleCurveTrade((idempotencyKey) => sellTokens(tokens, idempotencyKey), 'Sale confirmed.')
                }
              />
            ) : null}
            {(graduationReport || curve?.graduated) && (
              <div className="mt-4">
                <StartupGraduationClaim
                  startupId={startup.id}
                  graduated
                />
              </div>
            )}
        </aside>
      </div>
    </div>
  )
}
