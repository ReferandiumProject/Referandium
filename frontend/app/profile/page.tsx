'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePrivy, useFundWallet, useHeadlessDelegatedActions } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { Decimal } from '@/lib/decimal'
import { formatUsd, formatTokenAmount, formatPrice, formatVoteCount } from '@/lib/format'

type Balance = {
  available_usdc: number
  locked_usdc: number
  released?: { count: number; usdc: number }
}

type PendingPack = {
  id: string
  usdc_granted: number
  release_after: string
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

type FounderStats = {
  active_voters: number
  lifetime_voters: number
  token_holders: number
  trade_count: number
  platform_fees_generated: string
}

type FounderCurve = {
  pool_usdc: string
  capital_target: string
  price: string
  progress: number
  graduated: boolean
  frozen: boolean
} | null

type MyStartup = {
  id: string
  name: string
  slug: string
  description: string | null
  pitch: string | null
  website: string | null
  twitter: string | null
  logo_url: string | null
  stage: string | null
  phase: number
  vote_threshold: number
  capital_target: string
  total_yes_votes: number
  total_no_votes: number
  created_at: string
  phase1_closed_at: string | null
  founder_stats: FounderStats
  curve: FounderCurve
}

type EditableStartupFields = {
  description: string
  pitch: string
  website: string
  twitter: string
  logo_url: string
  stage: string
}

// Throws if `s` cannot be parsed. Callers must catch this and
// surface the failure instead of silently computing gain/loss
// against a fabricated zero.
const decimalUsdOrThrow = (s: string | null | undefined) => Decimal.parse(String(s ?? 0))

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

const STAGE_OPTIONS = ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B+', 'Growth'] as const

function PhaseBadge({ phase }: { phase: number }) {
  const labels: Record<number, string> = { 1: 'Validating', 2: 'Raising', 3: 'Completed' }
  const colors: Record<number, string> = {
    1: 'bg-[#3B82F6]/10 text-[#3B82F6]',
    2: 'bg-[#F59E0B]/10 text-[#B45309]',
    3: 'bg-[#10B981]/10 text-[#10B981]',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colors[phase] ?? 'bg-[#E5E7EB] text-[#6B7280]'}`}>
      {labels[phase] ?? `Phase ${phase}`}
    </span>
  )
}

function MyStartupStats({ startup }: { startup: MyStartup }) {
  if (startup.phase === 1) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-[#6B7280]">Distinct voters</p>
          <p className="font-semibold text-[#111827]">{formatVoteCount(startup.founder_stats.active_voters)}</p>
        </div>
        <div>
          <p className="text-xs text-[#6B7280]">Lifetime voters</p>
          <p className="font-semibold text-[#111827]">{formatVoteCount(startup.founder_stats.lifetime_voters)}</p>
        </div>
        <div>
          <p className="text-xs text-[#6B7280]">Yes votes</p>
          <p className="font-medium text-[#111827]">{formatVoteCount(startup.total_yes_votes)}</p>
        </div>
        <div>
          <p className="text-xs text-[#6B7280]">No votes</p>
          <p className="font-medium text-[#111827]">{formatVoteCount(startup.total_no_votes)}</p>
        </div>
      </div>
    )
  }

  if (startup.phase === 2 && startup.curve) {
    return (
      <>
        <div className="mt-3 flex items-center justify-between text-xs text-[#6B7280]">
          <span>Raised</span>
          <span>
            {formatUsd(startup.curve.pool_usdc)} / {formatUsd(startup.curve.capital_target)}
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
          <div
            className="h-full bg-[#3B82F6]"
            style={{ width: `${Math.min(100, Math.max(0, startup.curve.progress))}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-[#6B7280]">Distinct holders</p>
            <p className="font-semibold text-[#111827]">{formatVoteCount(startup.founder_stats.token_holders)}</p>
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">Trades</p>
            <p className="font-medium text-[#111827]">{formatVoteCount(startup.founder_stats.trade_count)}</p>
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">Platform fees generated</p>
            <p className="font-medium text-[#111827]">{formatUsd(startup.founder_stats.platform_fees_generated)}</p>
          </div>
        </div>
      </>
    )
  }

  // Phase 3: final totals.
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs text-[#6B7280]">Final amount raised</p>
        <p className="font-semibold text-[#111827]">
          {startup.curve ? formatUsd(startup.curve.pool_usdc) : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-[#6B7280]">Distinct holders</p>
        <p className="font-medium text-[#111827]">{formatVoteCount(startup.founder_stats.token_holders)}</p>
      </div>
      <div>
        <p className="text-xs text-[#6B7280]">Platform fees generated</p>
        <p className="font-medium text-[#111827]">{formatUsd(startup.founder_stats.platform_fees_generated)}</p>
      </div>
    </div>
  )
}

function MyStartupEditForm({
  form,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  form: EditableStartupFields
  saving: boolean
  error: string | null
  onChange: (fields: Partial<EditableStartupFields>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
      {error && (
        <div className="mb-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-2 text-xs text-[#EF4444]">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Description
          </span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#3B82F6]"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Pitch
          </span>
          <textarea
            value={form.pitch}
            onChange={(e) => onChange({ pitch: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#3B82F6]"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Website
          </span>
          <input
            type="text"
            value={form.website}
            onChange={(e) => onChange({ website: e.target.value })}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#3B82F6]"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Twitter
          </span>
          <input
            type="text"
            value={form.twitter}
            onChange={(e) => onChange({ twitter: e.target.value })}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#3B82F6]"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Logo URL
          </span>
          <input
            type="text"
            value={form.logo_url}
            onChange={(e) => onChange({ logo_url: e.target.value })}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#3B82F6]"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Stage
          </span>
          <select
            value={form.stage}
            onChange={(e) => onChange({ stage: e.target.value })}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#3B82F6]"
          >
            <option value="">—</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
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
  const [pendingPacks, setPendingPacks] = useState<PendingPack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [devnetLoading, setDevnetLoading] = useState(false)
  const [devnetMessage, setDevnetMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [depositInfoLoading, setDepositInfoLoading] = useState(false)
  const [depositInfoMessage, setDepositInfoMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [walletConfirmLoading, setWalletConfirmLoading] = useState(false)
  const [walletConfirmMessage, setWalletConfirmMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [cardMessage, setCardMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  const [myStartups, setMyStartups] = useState<MyStartup[] | null>(null)
  const [myStartupsError, setMyStartupsError] = useState<string | null>(null)
  const [editingStartupId, setEditingStartupId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditableStartupFields | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [depositMode, setDepositMode] = useState<'devnet' | 'wallet' | 'card'>('devnet')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [depositSig, setDepositSig] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawMessage, setWithdrawMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [cardAmount, setCardAmount] = useState('')
  const [copied, setCopied] = useState(false)
  const [delegating, setDelegating] = useState(false)
  const [delegationError, setDelegationError] = useState<string | null>(null)
  const DELEGATION_TIMEOUT_MS = 30000
  const formatPrivyError = (err: any): string => {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    if (err?.message) return String(err.message)
    if (err?.error) return typeof err.error === 'string' ? err.error : JSON.stringify(err.error)
    if (err?.reason) return String(err.reason)
    return JSON.stringify(err)
  }
  const [enabled, setEnabled] = useState(false)

  const [activeTab, setActiveTab] = useState<'account' | 'activity' | 'startups'>('account')
  const [listingCredits, setListingCredits] = useState<number | null>(null)
  const [listingCreditsLoading, setListingCreditsLoading] = useState(false)

  const fetchProfile = async () => {
    const token = await getAccessToken()
    if (!token) {
      setError('Not authenticated')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [balanceRes, voteRes, holdingsRes, myStartupsRes, pendingRes, listingCreditsRes] =
        await Promise.all([
          fetch('/api/balance', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/startup-votes/mine', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/curve/mine', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/my-startups', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/investment-packs/pending', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/listing-credits', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

      setListingCreditsLoading(false)
      const balanceJson = await balanceRes.json().catch(() => ({}))
      const voteJson = await voteRes.json().catch(() => ({}))
      const holdingsJson = await holdingsRes.json().catch(() => ({}))
      const myStartupsJson = await myStartupsRes.json().catch(() => ({}))
      const pendingJson = await pendingRes.json().catch(() => ({}))
      const listingCreditsJson = await listingCreditsRes.json().catch(() => ({}))

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

      if (!pendingRes.ok) {
        setError((prev) => prev || pendingJson.error || 'Failed to load pending investment packs')
      } else {
        setPendingPacks(pendingJson.packs || [])
      }

      if (!myStartupsRes.ok) {
        setMyStartupsError(myStartupsJson.error || 'Failed to load your startups')
      } else {
        setMyStartupsError(null)
        setMyStartups(Array.isArray(myStartupsJson) ? myStartupsJson : [])
      }

      if (!listingCreditsRes.ok) {
        setError((prev) => prev || listingCreditsJson.error || 'Failed to load listing credits')
      } else {
        setListingCredits(listingCreditsJson.credits ?? 0)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
      setListingCreditsLoading(false)
    }
  }

  const fetchMyStartups = async () => {
    const token = await getAccessToken()
    if (!token) return
    try {
      const res = await fetch('/api/my-startups', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMyStartupsError(json.error || 'Failed to load your startups')
      } else {
        setMyStartupsError(null)
        setMyStartups(Array.isArray(json) ? json : [])
      }
    } catch (err: any) {
      setMyStartupsError(err.message || 'Failed to load your startups')
    }
  }

  const startEditingStartup = (startup: MyStartup) => {
    setEditingStartupId(startup.id)
    setEditError(null)
    setEditForm({
      description: startup.description ?? '',
      pitch: startup.pitch ?? '',
      website: startup.website ?? '',
      twitter: startup.twitter ?? '',
      logo_url: startup.logo_url ?? '',
      stage: startup.stage ?? '',
    })
  }

  const cancelEditingStartup = () => {
    setEditingStartupId(null)
    setEditForm(null)
    setEditError(null)
  }

  const saveEditingStartup = async (startupId: string) => {
    if (!editForm) return
    setEditSaving(true)
    setEditError(null)

    const token = await getAccessToken()
    if (!token) {
      setEditError('Not authenticated')
      setEditSaving(false)
      return
    }

    try {
      const res = await fetch(`/api/my-startups/${startupId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(json.error || 'Failed to save changes')
        return
      }
      setEditingStartupId(null)
      setEditForm(null)
      await fetchMyStartups()
    } catch (err: any) {
      setEditError(err.message || 'Failed to save changes')
    } finally {
      setEditSaving(false)
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
    setDevnetLoading(true)
    setDevnetMessage(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        setDevnetMessage({ type: 'error', text: 'Not authenticated' })
        return
      }

      const amount = parseFloat(depositAmount)
      if (!amount || amount <= 0) {
        setDevnetMessage({ type: 'error', text: 'Amount must be greater than 0' })
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
        setDevnetMessage({ type: 'error', text: json.error || 'Deposit failed' })
        return
      }

      setDevnetMessage({ type: 'success', text: `Deposited. New balance: ${json.new_balance}` })
      setDepositAmount('')
      fetchProfile()
    } catch (err: any) {
      setDevnetMessage({ type: 'error', text: err?.message || 'Deposit failed' })
    } finally {
      setDevnetLoading(false)
    }
  }

  const loadDepositInfo = async () => {
    setDepositInfoLoading(true)
    setDepositInfoMessage(null)

    try {
      const res = await fetch('/api/deposit/wallet', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDepositInfoMessage({ type: 'error', text: json.error || 'Failed to load deposit info' })
        return
      }
      setDepositInfo(json)
      setDepositInfoMessage({ type: 'success', text: 'Deposit address loaded' })
    } catch (err: any) {
      setDepositInfoMessage({ type: 'error', text: err?.message || 'Failed to load deposit info' })
    } finally {
      setDepositInfoLoading(false)
    }
  }

  const handleWalletDepositConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setWalletConfirmLoading(true)
    setWalletConfirmMessage(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        setWalletConfirmMessage({ type: 'error', text: 'Not authenticated' })
        return
      }

      if (!depositSig.trim()) {
        setWalletConfirmMessage({ type: 'error', text: 'Transaction signature is required' })
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
        setWalletConfirmMessage({ type: 'error', text: json.error || 'Confirm failed' })
        return
      }

      setWalletConfirmMessage({ type: 'success', text: `Credited ${json.credited_amount}. New balance: ${json.new_balance}` })
      setDepositSig('')
      fetchProfile()
    } catch (err: any) {
      setWalletConfirmMessage({ type: 'error', text: err?.message || 'Confirm failed' })
    } finally {
      setWalletConfirmLoading(false)
    }
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    setWithdrawLoading(true)
    setWithdrawMessage(null)

    try {
      const token = await getAccessToken()
      if (!token) {
        setWithdrawMessage({ type: 'error', text: 'Not authenticated' })
        setWithdrawLoading(false)
        return
      }

      const amount = parseFloat(withdrawAmount)
      if (!amount || amount <= 0) {
        setWithdrawMessage({ type: 'error', text: 'Amount must be greater than 0' })
        setWithdrawLoading(false)
        return
      }
      if (!withdrawWallet.trim()) {
        setWithdrawMessage({ type: 'error', text: 'Wallet address is required' })
        setWithdrawLoading(false)
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
        setWithdrawMessage({
          type: 'error',
          text: json.error || 'Withdraw failed',
        })
        setWithdrawLoading(false)
        return
      }

      setWithdrawMessage({
        type: 'success',
        text: `Withdrawn. New balance: ${json.new_balance}`,
      })
      setWithdrawAmount('')
      setWithdrawWallet('')
      await fetchProfile()
    } catch (err: any) {
      setWithdrawMessage({
        type: 'error',
        text: err?.message || 'Withdraw failed. Please try again.',
      })
    } finally {
      setWithdrawLoading(false)
    }
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
        <div className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm" role="tablist" aria-label="Profile tabs">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('account')}
              aria-selected={activeTab === 'account'}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'account'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB]'
              }`}
            >
              Account
              {(pendingPacks ?? []).length > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  {(pendingPacks ?? []).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              aria-selected={activeTab === 'activity'}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'activity'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB]'
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('startups')}
              aria-selected={activeTab === 'startups'}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'startups'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB]'
              }`}
            >
              My startups
              {(myStartups ?? []).length > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  {(myStartups ?? []).length}
                </span>
              )}
            </button>
          </div>
        </div>

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'account' ? '' : 'hidden'}`}>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#111827]">Account</h1>
              <p className="mt-1 text-sm text-[#6B7280]">Your balance, credits, and investment packs</p>
              {balance?.released && (balance.released.count > 0 || balance.released.usdc > 0) && (
                <div className="mt-4 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-3 text-sm text-[#10B981]">
                  Your funds have arrived: {formatUsd(balance.released.usdc)} from {balance.released.count} released investment pack{balance.released.count === 1 ? '' : 's'}.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('account')
                  setTimeout(() => document.getElementById('deposit')?.scrollIntoView({ behavior: 'smooth' }), 0)
                }}
                className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('account')
                  setTimeout(() => document.getElementById('withdraw')?.scrollIntoView({ behavior: 'smooth' }), 0)
                }}
                className="rounded-lg border border-[#3B82F6] bg-white px-5 py-2.5 text-sm font-semibold text-[#3B82F6] transition-colors hover:bg-[#F9FAFB]"
              >
                Withdraw
              </button>
              <Link
                href="/buy"
                className="rounded-lg border border-[#3B82F6] bg-white px-5 py-2.5 text-center text-sm font-semibold text-[#3B82F6] transition-colors hover:bg-[#F9FAFB]"
              >
                Buy packs
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Available USDC</p>
              <p className="mt-1 text-2xl font-semibold text-[#111827]">{formatUsd(balance?.available_usdc)}</p>
              <p className="mt-1 text-xs text-[#6B7280]">Real money deposited on the platform. Withdrawable.</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Locked USDC</p>
              <p className="mt-1 text-2xl font-semibold text-[#111827]">{formatUsd(balance?.locked_usdc)}</p>
              <p className="mt-1 text-xs text-[#6B7280]">Held for pending votes and investment packs.</p>
            </div>
            <div className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#92400E]">Listing credits</p>
              <p className="mt-1 text-2xl font-semibold text-[#92400E]">
                {listingCreditsLoading ? '—' : formatVoteCount(listingCredits ?? 0)}
              </p>
              <p className="mt-1 text-xs text-[#92400E]">
                Credits never expire and are spent when listing a startup.
                <Link href="/buy" className="ml-1 font-semibold text-[#B45309] hover:text-[#92400E]">
                  Buy more
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'account' ? '' : 'hidden'}`}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[#111827]">Pending investment packs</h2>
            <p className="text-sm text-[#6B7280]">
              Money you&apos;ve paid that is still settling. Funds become spendable on the date shown.
            </p>
          </div>
          {pendingPacks === null ? (
            <p className="text-sm text-[#6B7280]">Loading pending packs...</p>
          ) : pendingPacks.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No investment packs currently pending.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pendingPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4"
                >
                  <p className="text-sm font-semibold text-[#111827]">{formatUsd(pack.usdc_granted)}</p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Available {new Date(pack.release_after).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'activity' ? '' : 'hidden'}`}>
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
                  {formatVoteCount(voteState.balance.remaining_today)}
                  <span className="ml-1 text-sm font-normal text-[#6B7280]">
                    / {formatVoteCount(voteState.balance.granted_today)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  100 free tokens added each day. Use them or lose them by end of day.
                </p>
              </div>
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Pool balance</p>
                <p className="mt-1 text-2xl font-semibold text-[#111827]">
                  {formatVoteCount(voteState.balance.pool_balance)}
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

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'activity' ? '' : 'hidden'}`}>
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
                      {formatVoteCount(pos.votes)} votes · net {formatVoteCount(pos.net)} /{' '}
                      {formatVoteCount(pos.vote_threshold)}
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

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'activity' ? '' : 'hidden'}`}>
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
                const zeroDecimal = new Decimal(BigInt(0), 0)
                let cost = zeroDecimal
                let spot = zeroDecimal
                let gainLossFailed = false
                try {
                  cost = decimalUsdOrThrow(h.cost_basis)
                  spot = decimalUsdOrThrow(h.spot_value_estimate)
                } catch (err) {
                  console.error('[profile] failed to parse holding cost/spot value', {
                    startup_id: h.startup_id,
                    cost_basis: h.cost_basis,
                    spot_value_estimate: h.spot_value_estimate,
                    err,
                  })
                  gainLossFailed = true
                }
                const gainLoss = spot.sub(cost)
                const isGain = !gainLossFailed && gainLoss.cmp(zeroDecimal) > 0
                const isLoss = !gainLossFailed && gainLoss.cmp(zeroDecimal) < 0
                const gainLossAbs =
                  gainLoss.value < BigInt(0)
                    ? new Decimal(-gainLoss.value, gainLoss.scale)
                    : gainLoss

                let percentChange = zeroDecimal
                if (!gainLossFailed && !cost.isZero()) {
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
                          <p className="font-medium text-[#111827]">{formatTokenAmount(h.tokens)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6B7280]">Current price</p>
                          <p className="font-medium text-[#111827]">${formatPrice(h.current_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6B7280]">Cost basis</p>
                          <p className="font-medium text-[#111827]">{formatUsd(h.cost_basis)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[#6B7280]">Estimated value</p>
                          <p className="font-medium text-[#111827]">{formatUsd(h.spot_value_estimate)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-xs text-[#6B7280]">vs cost basis:</span>
                        <span
                          className={`font-semibold ${
                            isGain ? 'text-[#10B981]' : isLoss ? 'text-[#EF4444]' : 'text-[#6B7280]'
                          }`}
                        >
                          {gainLossFailed
                            ? '—'
                            : `${isGain ? '+' : isLoss ? '-' : ''}${formatUsd(gainLossAbs.toString())}`}
                        </span>
                        {!gainLossFailed && !cost.isZero() && (
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

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'startups' ? '' : 'hidden'}`}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[#111827]">My startups</h2>
            <p className="text-sm text-[#6B7280]">
              Startups you&apos;ve listed. Name, slug, vote threshold, and capital target cannot be
              changed here — see each field&apos;s note below for why.
            </p>
          </div>

          {myStartupsError && (
            <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
              {myStartupsError}
            </div>
          )}

          {myStartups === null ? (
            <p className="text-sm text-[#6B7280]">Loading your startups...</p>
          ) : myStartups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 text-center">
              <p className="text-sm text-[#6B7280]">
                This is where startups you list will appear. Start building your founder page to get votes and raise capital.
              </p>
              <Link
                href="/list"
                className="mt-3 inline-block text-sm font-semibold text-[#3B82F6] hover:text-blue-700"
              >
                List a startup
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {myStartups.map((s) => (
                <div key={s.id} className="rounded-lg border border-[#E5E7EB] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-[#111827]">{s.name}</p>
                        <PhaseBadge phase={s.phase} />
                      </div>
                      <Link
                        href={`/startup/${s.slug}`}
                        className="mt-1 inline-block text-xs font-semibold text-[#3B82F6] hover:text-blue-700"
                      >
                        View public page →
                      </Link>

                      <MyStartupStats startup={s} />
                    </div>

                    {editingStartupId !== s.id && (
                      <button
                        type="button"
                        onClick={() => startEditingStartup(s)}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB]"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-[#F9FAFB] p-3 text-xs text-[#6B7280] sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-[#111827]">Name & slug fixed:</span> the
                      slug is the public URL people have already shared, and renaming mid-raise
                      would let a startup become something other than what backers evaluated.
                    </p>
                    <p>
                      <span className="font-medium text-[#111827]">Threshold & target fixed:</span>{' '}
                      lowering your own threshold would bypass the validation it represents, and
                      the capital target sets the curve&apos;s virtual reserve, so changing it
                      after a raise opens would alter the terms people already bought under. Only
                      admins can change these.
                    </p>
                  </div>

                  {editingStartupId === s.id && editForm && (
                    <MyStartupEditForm
                      form={editForm}
                      saving={editSaving}
                      error={editError}
                      onChange={(fields) => setEditForm((prev) => (prev ? { ...prev, ...fields } : prev))}
                      onSave={() => saveEditingStartup(s.id)}
                      onCancel={cancelEditingStartup}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'activity' ? '' : 'hidden'}`}>
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
                      {formatVoteCount(pos.votes)} votes contributed · threshold reached
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="deposit" className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'account' ? '' : 'hidden'}`}>
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
            <>
              {devnetMessage && (
                <div
                  className={`mb-4 rounded-lg border p-3 text-sm ${
                    devnetMessage.type === 'error'
                      ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
                      : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
                  }`}
                >
                  {devnetMessage.text}
                </div>
              )}
              <form onSubmit={handleDevnetDeposit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount USDC"
                  disabled={devnetLoading}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={devnetLoading}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {devnetLoading ? 'Depositing...' : 'Deposit Devnet'}
                </button>
              </form>
            </>
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
                          setCopyError(null)
                          setTimeout(() => setCopied(false), 2000)
                        } catch (err: any) {
                          setCopyError(err?.message || 'Failed to copy address')
                        }
                      }}
                      className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  {copyError && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#EF4444]">{copyError}</p>
                  )}
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
                        let timer: ReturnType<typeof setTimeout> | undefined
                        try {
                          await Promise.race([
                            delegateWallet({ address: depositAddress, chainType: 'solana' }).finally(() => {
                              if (timer) clearTimeout(timer)
                            }),
                            new Promise<never>((_, reject) => {
                              timer = setTimeout(() => {
                                reject(new Error(`Privy delegation request timed out after ${DELEGATION_TIMEOUT_MS / 1000} seconds`))
                              }, DELEGATION_TIMEOUT_MS)
                            }),
                          ])
                          setEnabled(true)
                        } catch (err: any) {
                          setDelegationError(formatPrivyError(err))
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
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#EF4444]">{delegationError}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[#6B7280]">Your deposit address is being set up, refresh shortly.</p>
              )}

              <button
                onClick={loadDepositInfo}
                disabled={depositInfoLoading}
                className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {depositInfoLoading ? 'Loading...' : 'Load Deposit Address'}
              </button>
              {depositInfoMessage && (
                <div
                  className={`mb-4 rounded-lg border p-3 text-sm ${
                    depositInfoMessage.type === 'error'
                      ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
                      : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
                  }`}
                >
                  {depositInfoMessage.text}
                </div>
              )}
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
                  {walletConfirmMessage && (
                    <div
                      className={`mb-4 rounded-lg border p-3 text-sm ${
                        walletConfirmMessage.type === 'error'
                          ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
                          : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
                      }`}
                    >
                      {walletConfirmMessage.text}
                    </div>
                  )}
                  <form
                    onSubmit={handleWalletDepositConfirm}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center"
                  >
                    <input
                      type="text"
                      value={depositSig}
                      onChange={(e) => setDepositSig(e.target.value)}
                      placeholder="Deposit transaction signature"
                      disabled={walletConfirmLoading}
                      className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={walletConfirmLoading}
                      className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {walletConfirmLoading ? 'Confirming...' : 'Confirm Wallet Deposit'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {cardMessage && (
                <div
                  className={`mb-4 rounded-lg border p-3 text-sm ${
                    cardMessage.type === 'error'
                      ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
                      : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
                  }`}
                >
                  {cardMessage.text}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  step="0.01"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="Amount USDC (optional)"
                  disabled={cardLoading}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  onClick={async () => {
                    if (!dbUser?.wallet_address) {
                      setCardMessage({ type: 'error', text: 'No wallet address available' })
                      return
                    }
                    setCardLoading(true)
                    setCardMessage(null)
                    try {
                      await fundWallet({
                        address: dbUser.wallet_address,
                        options: {
                          asset: 'USDC',
                          amount: cardAmount || undefined,
                        } as any,
                      })
                      setCardMessage({ type: 'success', text: 'Card funding widget opened. Complete the Privy flow to receive USDC in your wallet.' })
                    } catch (err: any) {
                      console.error('[Privy] fundWallet error:', err)
                      setCardMessage({ type: 'error', text: err?.message || 'Card funding failed to open' })
                    } finally {
                      setCardLoading(false)
                    }
                  }}
                  disabled={!dbUser?.wallet_address || cardLoading}
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cardLoading ? 'Opening...' : 'Buy USDC with Card'}
                </button>
              </div>
              <p className="text-xs text-[#6B7280]">
                Funds go to your embedded Solana wallet. After they arrive, use the Wallet Deposit flow to credit your platform balance.
              </p>
            </div>
          )}
        </section>

        <section id="withdraw" className={`mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${activeTab === 'account' ? '' : 'hidden'}`}>
          <h2 className="mb-4 text-lg font-semibold text-[#111827]">Withdraw</h2>
          {withdrawMessage && (
            <div
              className={`mb-4 rounded-lg border p-3 text-sm ${
                withdrawMessage.type === 'error'
                  ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
                  : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
              }`}
            >
              {withdrawMessage.text}
            </div>
          )}
          <form onSubmit={handleWithdraw} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="number"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount USDC"
              disabled={withdrawLoading}
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              type="text"
              value={withdrawWallet}
              onChange={(e) => setWithdrawWallet(e.target.value)}
              placeholder="Destination wallet address"
              disabled={withdrawLoading}
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={withdrawLoading}
              className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawLoading ? 'Withdrawing...' : 'Withdraw'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
