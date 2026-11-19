'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePrivy, useFundWallet, useSigners } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import WalletLinkingSection from '@/app/components/WalletLinkingSection'
import EmbeddedDeposit from '@/app/components/EmbeddedDeposit'
import { ProfileGraduationClaims } from '@/app/components/ProfileGraduationClaims'
import { Decimal } from '@/lib/decimal'
import { formatUsd, formatTokenAmount, formatPrice, formatVoteCount } from '@/lib/format'
import { Badge, EmptyState, Logo, Notice, Progress, buttonClass, cx, inputClass } from '@/app/components/ui'

const PRIVY_SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID!
if (!PRIVY_SIGNER_ID) {
  throw new Error('NEXT_PUBLIC_PRIVY_SIGNER_ID is not set in the environment')
}

const DELEGATION_TIMEOUT_MS = 30000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

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

function Avatar({ name, src }: { name: string; src: string | null }) {
  return <Logo name={name} src={src} size={40} />
}

const STAGE_OPTIONS = ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B+', 'Growth'] as const

function PhaseBadge({ phase }: { phase: number }) {
  const labels: Record<number, string> = { 1: 'Voting', 2: 'Raising', 3: 'Raise complete' }
  const tones: Record<number, 'neutral' | 'accent' | 'yes'> = { 1: 'neutral', 2: 'accent', 3: 'yes' }
  return <Badge tone={tones[phase] ?? 'neutral'}>{labels[phase] ?? `Phase ${phase}`}</Badge>
}

function MyStartupStats({ startup }: { startup: MyStartup }) {
  if (startup.phase === 1) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <p className="text-[13px] text-muted">Distinct voters</p>
          <p className="num mt-0.5 font-semibold text-ink">{formatVoteCount(startup.founder_stats.active_voters)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">Lifetime voters</p>
          <p className="num mt-0.5 font-semibold text-ink">{formatVoteCount(startup.founder_stats.lifetime_voters)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">Yes votes</p>
          <p className="num mt-0.5 font-medium text-ink">{formatVoteCount(startup.total_yes_votes)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">No votes</p>
          <p className="num mt-0.5 font-medium text-ink">{formatVoteCount(startup.total_no_votes)}</p>
        </div>
      </div>
    )
  }

  if (startup.phase === 2 && startup.curve) {
    return (
      <>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>Raised</span>
          <span>
            {formatUsd(startup.curve.pool_usdc)} / {formatUsd(startup.curve.capital_target)}
          </span>
        </div>
        <Progress value={startup.curve.progress} tone="accent" className="mt-1.5" />
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[13px] text-muted">Distinct holders</p>
            <p className="num mt-0.5 font-semibold text-ink">{formatVoteCount(startup.founder_stats.token_holders)}</p>
          </div>
          <div>
            <p className="text-[13px] text-muted">Trades</p>
            <p className="num mt-0.5 font-medium text-ink">{formatVoteCount(startup.founder_stats.trade_count)}</p>
          </div>
          <div>
            <p className="text-[13px] text-muted">Platform fees generated</p>
            <p className="num mt-0.5 font-medium text-ink">{formatUsd(startup.founder_stats.platform_fees_generated)}</p>
          </div>
        </div>
      </>
    )
  }

  // Phase 3: final totals.
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      <div>
        <p className="text-[13px] text-muted">Final amount raised</p>
        <p className="num mt-0.5 font-semibold text-ink">
          {startup.curve ? formatUsd(startup.curve.pool_usdc) : '—'}
        </p>
      </div>
      <div>
        <p className="text-[13px] text-muted">Distinct holders</p>
        <p className="num mt-0.5 font-medium text-ink">{formatVoteCount(startup.founder_stats.token_holders)}</p>
      </div>
      <div>
        <p className="text-[13px] text-muted">Platform fees generated</p>
        <p className="num mt-0.5 font-medium text-ink">{formatUsd(startup.founder_stats.platform_fees_generated)}</p>
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
  selectedLogoFile,
  onLogoFileSelect,
}: {
  form: EditableStartupFields
  saving: boolean
  error: string | null
  onChange: (fields: Partial<EditableStartupFields>) => void
  onSave: () => void
  onCancel: () => void
  selectedLogoFile: File | null
  onLogoFileSelect: (file: File | null) => void
}) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      {error && (
        <Notice tone="no" className="mb-3">
          {error}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Description
          </span>
          <textarea
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className={cx(inputClass, 'text-sm')}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Pitch
          </span>
          <textarea
            value={form.pitch}
            onChange={(e) => onChange({ pitch: e.target.value })}
            rows={3}
            className={cx(inputClass, 'text-sm')}
          />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Website
          </span>
          <input
            type="text"
            value={form.website}
            onChange={(e) => onChange({ website: e.target.value })}
            className={cx(inputClass, 'text-sm')}
          />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Twitter
          </span>
          <input
            type="text"
            value={form.twitter}
            onChange={(e) => onChange({ twitter: e.target.value })}
            className={cx(inputClass, 'text-sm')}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Logo
          </span>
          {form.logo_url && !selectedLogoFile && (
            <div className="mb-2 flex items-center gap-3">
              <img
                src={form.logo_url}
                alt="Current logo"
                className="h-12 w-12 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  onChange({ logo_url: '' })
                  onLogoFileSelect(null)
                }}
                className="text-xs font-semibold text-no hover:text-no"
              >
                Remove
              </button>
            </div>
          )}
          {selectedLogoFile && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span className="rounded bg-accent-soft px-2 py-1 text-accent">
                {selectedLogoFile.name}
              </span>
              <button
                type="button"
                onClick={() => onLogoFileSelect(null)}
                className="text-no hover:text-no"
              >
                Remove
              </button>
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onLogoFileSelect(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-subtle"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Stage
          </span>
          <select
            value={form.stage}
            onChange={(e) => onChange({ stage: e.target.value })}
            className={cx(inputClass, 'text-sm')}
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
          className={buttonClass('primary', 'md', 'h-10')}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={buttonClass('ghost', 'md', 'h-10')}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { ready, authenticated, getAccessToken, login, user } = usePrivy()
  const { dbUser } = useUser()
  const { fundWallet } = useFundWallet({
    onUserExited: () => console.log('[Privy] card funding flow exited'),
  })
  const { addSigners } = useSigners()

  const [balance, setBalance] = useState<Balance | null>(null)
  const [voteState, setVoteState] = useState<VoteState | null>(null)
  const [holdings, setHoldings] = useState<CurveHolding[] | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [pendingPacks, setPendingPacks] = useState<PendingPack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [devnetLoading, setDevnetLoading] = useState(false)
  const [devnetMessage, setDevnetMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [cardMessage, setCardMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  const [myStartups, setMyStartups] = useState<MyStartup[] | null>(null)
  const [myStartupsError, setMyStartupsError] = useState<string | null>(null)
  const [editingStartupId, setEditingStartupId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditableStartupFields | null>(null)
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [depositMode, setDepositMode] = useState<'devnet' | 'embedded' | 'card'>('devnet')
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawWallet, setWithdrawWallet] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawMessage, setWithdrawMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [cardAmount, setCardAmount] = useState('')
  const [copied, setCopied] = useState(false)
  const [delegating, setDelegating] = useState(false)
  const [delegationMessage, setDelegationMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const formatPrivyError = (err: any): string => {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    if (err?.message) return String(err.message)
    if (err?.error) return typeof err.error === 'string' ? err.error : JSON.stringify(err.error)
    if (err?.reason) return String(err.reason)
    return JSON.stringify(err)
  }
  const [enabled, setEnabled] = useState(false)

  const [activeTab, setActiveTab] = useState<'account' | 'activity' | 'startups' | 'claims'>('account')
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
    setSelectedLogoFile(null)
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
    setSelectedLogoFile(null)
    setEditError(null)
  }

  const uploadLogo = async (file: File, startupId: string, token: string): Promise<string> => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      throw new Error('Logo must be PNG, JPEG, or WebP')
    }

    const res = await fetch('/api/startup-logos/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ startup_id: startupId, content_type: file.type }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error || 'Could not get upload URL')
    }
    const { signedUrl, publicUrl } = await res.json()
    const uploadRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-upsert': 'false',
      },
      body: file,
    })
    if (!uploadRes.ok) {
      throw new Error('Logo upload failed')
    }
    return publicUrl
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
      let logoUrl = editForm.logo_url
      if (selectedLogoFile) {
        logoUrl = await uploadLogo(selectedLogoFile, startupId, token)
      }
      const body: any = { ...editForm, logo_url: logoUrl || null }

      const res = await fetch(`/api/my-startups/${startupId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEditError(json.error || 'Failed to save changes')
        return
      }
      setEditingStartupId(null)
      setEditForm(null)
      setSelectedLogoFile(null)
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

  const depositLabels: Record<'devnet' | 'embedded' | 'card', string> = {
    devnet: 'Devnet faucet',
    embedded: 'Wallet',
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

  const handleEnableServerSigning = async () => {
    if (!depositAddress) return
    setDelegating(true)
    setDelegationMessage(null)
    try {
      await withTimeout(
        addSigners({
          address: depositAddress,
          signers: [{ signerId: PRIVY_SIGNER_ID }],
        }),
        DELEGATION_TIMEOUT_MS,
        'Enabling server signing timed out after 30 seconds. Try again or refresh the page.'
      )
      setDelegationMessage({ type: 'success', text: 'Server signing enabled for this wallet.' })
    } catch (err: any) {
      console.error('[Privy] addSigners error:', err)
      setDelegationMessage({ type: 'error', text: formatPrivyError(err) })
    } finally {
      setDelegating(false)
    }
  }

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
      <div className="mx-auto w-full max-w-xl px-4 py-24 sm:px-6">
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.03em] sm:text-[44px]">Your profile</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Sign in to see your balance, voting power and token holdings.
        </p>
        <button onClick={() => login()} className={buttonClass('primary', 'lg', 'mt-8')}>
          Sign in to continue
        </button>
      </div>
    )
  }

  const profileTabs: { key: typeof activeTab; label: string; count?: number }[] = [
    { key: 'account', label: 'Account', count: (pendingPacks ?? []).length || undefined },
    { key: 'activity', label: 'Activity' },
    { key: 'startups', label: 'My startups', count: (myStartups ?? []).length || undefined },
    { key: 'claims', label: 'Token claims' },
  ]
  const sectionClass = (tab: typeof activeTab) =>
    cx('mb-4 animate-fade-up rounded-2xl border border-line bg-surface p-5 sm:p-6', activeTab === tab ? '' : 'hidden')

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">Your profile</h1>
          {(dbUser?.email || dbUser?.wallet_address) && (
            <p className="mt-2 truncate text-sm text-muted">{dbUser?.email ?? dbUser?.wallet_address}</p>
          )}
        </div>
        {loading && <p className="text-sm text-muted">Loading profile…</p>}
      </header>

      {error && (
        <Notice tone="no" className="mt-6">
          {error}
        </Notice>
      )}

      <div className="mb-8 mt-8 overflow-x-auto border-b border-line" role="tablist" aria-label="Profile tabs">
        <div className="flex gap-6">
          {profileTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              onClick={() => setActiveTab(t.key)}
              aria-selected={activeTab === t.key}
              className={cx(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-3 text-sm font-semibold transition-colors duration-200',
                activeTab === t.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="num text-xs text-faint">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

        <section className={cx('mb-4 animate-fade-up', activeTab === 'account' ? '' : 'hidden')}>
          {balance?.released && (balance.released.count > 0 || balance.released.usdc > 0) && (
            <Notice tone="yes" className="mb-4">
              Your funds have arrived: {formatUsd(balance.released.usdc)} from {balance.released.count} released investment pack{balance.released.count === 1 ? '' : 's'}.
            </Notice>
          )}
          <div className="grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-line">
            <div className="border-b border-line p-5 sm:border-b-0">
              <p className="text-[13px] text-muted">Available USDC</p>
              <p className="num mt-1 font-display text-[30px] font-bold tracking-tight">{formatUsd(balance?.available_usdc)}</p>
              <p className="mt-1 text-[13px] text-muted">Deposited on the platform. Withdrawable.</p>
            </div>
            <div className="border-b border-line p-5 sm:border-b-0">
              <p className="text-[13px] text-muted">Locked USDC</p>
              <p className="num mt-1 font-display text-[30px] font-bold tracking-tight">{formatUsd(balance?.locked_usdc)}</p>
              <p className="mt-1 text-[13px] text-muted">Held for pending votes and investment packs.</p>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-muted">Listing credits</p>
              <p className="num mt-1 font-display text-[30px] font-bold tracking-tight">
                {listingCreditsLoading ? '—' : formatVoteCount(listingCredits ?? 0)}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                Never expire. Spent when you list a startup.{' '}
                <Link href="/buy" className="font-medium text-accent hover:underline">
                  Buy more
                </Link>
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('account')
                setTimeout(() => document.getElementById('deposit')?.scrollIntoView({ behavior: 'smooth' }), 0)
              }}
              className={buttonClass('primary', 'md')}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('account')
                setTimeout(() => document.getElementById('withdraw')?.scrollIntoView({ behavior: 'smooth' }), 0)
              }}
              className={buttonClass('secondary', 'md')}
            >
              Withdraw
            </button>
            <Link href="/buy" className={buttonClass('secondary', 'md')}>
              Buy credits or USDC
            </Link>
          </div>
        </section>

        <div className={activeTab === 'account' ? '' : 'hidden'}>
          <section className="mb-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold">Server signing</h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              Grant the backend a session signer so it can complete transactions from this embedded wallet.
            </p>
            {delegationMessage && (
              <Notice tone={delegationMessage.type === 'error' ? 'no' : 'yes'} className="mb-4">
                {delegationMessage.text}
              </Notice>
            )}
            <button
              type="button"
              onClick={handleEnableServerSigning}
              disabled={delegating || !depositAddress}
              className={buttonClass('primary', 'md', 'h-10')}
            >
              {delegating ? 'Enabling…' : 'Enable server signing'}
            </button>
          </section>
          <WalletLinkingSection />
        </div>

        <section className={sectionClass('account')}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold">Pending investment packs</h2>
            <p className="text-sm text-muted">
              Money you&apos;ve paid that is still settling. Funds become spendable on the date shown.
            </p>
          </div>
          {pendingPacks === null ? (
            <p className="text-sm text-muted">Loading pending packs...</p>
          ) : pendingPacks.length === 0 ? (
            <p className="text-sm text-muted">No investment packs currently pending.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pendingPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="rounded-lg border border-line bg-canvas p-4"
                >
                  <p className="num text-[15px] font-semibold">{formatUsd(pack.usdc_granted)}</p>
                  <p className="mt-1 text-[13px] text-muted">
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

        <section className={sectionClass('activity')}>
          <h2 className="text-[15px] font-semibold">Voting power</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Votes are free tokens, not USDC. The daily grant resets each day if unused,
            while the pool holds votes you previously withdrew and never expires.
          </p>
          {voteState ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-canvas p-4">
                <p className="text-[13px] text-muted">Today&apos;s grant</p>
                <p className="num mt-1 text-2xl font-semibold tracking-tight">
                  {formatVoteCount(voteState.balance.remaining_today)}
                  <span className="ml-1 text-sm font-normal text-muted">
                    / {formatVoteCount(voteState.balance.granted_today)}
                  </span>
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  100 free tokens added each day. Use them or lose them by end of day.
                </p>
              </div>
              <div className="rounded-lg bg-canvas p-4">
                <p className="text-[13px] text-muted">Pool balance</p>
                <p className="num mt-1 text-2xl font-semibold tracking-tight">
                  {formatVoteCount(voteState.balance.pool_balance)}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  Votes withdrawn from startups. They never expire and can be redeployed any time.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Loading votes...</p>
          )}
        </section>

        <section className={sectionClass('activity')}>
          <h2 className="mb-4 text-[15px] font-semibold">Active votes</h2>
          {voteState === null ? (
            <p className="text-sm text-muted">Loading active votes...</p>
          ) : voteState.active.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
              <p className="text-sm text-muted">
                You are not currently backing any startups.
              </p>
              <Link
                href="/"
                className={buttonClass('secondary', 'sm', 'mt-4')}
              >
                Browse startups to start voting
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {voteState.active.map((pos) => (
                <Link
                  key={pos.startup_id}
                  href={`/startup/${pos.slug}`}
                  className="flex gap-4 rounded-lg border border-line p-4 transition-colors hover:border-line-strong hover:bg-canvas sm:items-center"
                >
                  <Avatar name={pos.name} src={pos.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{pos.name}</p>
                      <Badge tone={pos.direction === 'yes' ? 'yes' : 'no'}>{pos.direction === 'yes' ? 'Yes' : 'No'}</Badge>
                    </div>
                    <p className="num mt-1 text-[13px] text-muted">
                      {formatVoteCount(pos.votes)} of your votes, {formatVoteCount(pos.net)} / {formatVoteCount(pos.vote_threshold)} net
                    </p>
                    <Progress value={pos.progress} tone="neutral" className="mt-2" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={sectionClass('activity')}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold">Token holdings</h2>
            <p className="text-sm text-muted">
              Startup tokens you bought with real money. These are positions in active or completed raises, not voting tokens.
            </p>
          </div>

          {holdings === null || holdingsLoading ? (
            <p className="text-sm text-muted">Loading token holdings...</p>
          ) : holdings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
              <p className="text-sm text-muted">You don&apos;t hold any startup tokens yet.</p>
              <Link
                href="/"
                className={buttonClass('secondary', 'sm', 'mt-4')}
              >
                Browse startups
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
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
                    className="flex gap-4 rounded-lg border border-line p-4 transition-colors hover:border-line-strong hover:bg-canvas"
                  >
                    <Avatar name={h.name} src={h.logo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-ink">{h.name}</p>
                        {h.graduated && (
                          <Badge tone="yes">Raise complete</Badge>
                        )}
                        {h.frozen && (
                          <Badge tone="warn">Trading paused</Badge>
                        )}
                      </div>

                      {h.graduated && (
                        <p className="mt-1 text-xs text-yes">
                          The raise completed and the on-chain token is being prepared.
                        </p>
                      )}
                      {h.frozen && !h.graduated && (
                        <p className="mt-1 text-xs text-warn">
                          Trading is halted. Selling is still possible.
                        </p>
                      )}

                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-[13px] text-muted">Tokens</p>
                          <p className="num mt-0.5 font-medium text-ink">{formatTokenAmount(h.tokens)}</p>
                        </div>
                        <div>
                          <p className="text-[13px] text-muted">Current price</p>
                          <p className="num mt-0.5 font-medium text-ink">${formatPrice(h.current_price)}</p>
                        </div>
                        <div>
                          <p className="text-[13px] text-muted">Cost basis</p>
                          <p className="num mt-0.5 font-medium text-ink">{formatUsd(h.cost_basis)}</p>
                        </div>
                        <div>
                          <p className="text-[13px] text-muted">Estimated value</p>
                          <p className="num mt-0.5 font-medium text-ink">{formatUsd(h.spot_value_estimate)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-xs text-muted">vs cost basis:</span>
                        <span
                          className={`font-semibold ${
                            isGain ? 'text-yes' : isLoss ? 'text-no' : 'text-muted'
                          }`}
                        >
                          {gainLossFailed
                            ? '—'
                            : `${isGain ? '+' : isLoss ? '-' : ''}${formatUsd(gainLossAbs.toString())}`}
                        </span>
                        {!gainLossFailed && !cost.isZero() && (
                          <span
                            className={`text-xs ${
                              isGain ? 'text-yes' : isLoss ? 'text-no' : 'text-muted'
                            }`}
                          >
                            ({isGain ? '+' : ''}
                            {percentChange.toString()})
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-xs text-faint">
                        Estimated value is not a cash-out amount. Selling moves the price down the curve, so a large holding may realise less.
                      </p>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>Raise progress</span>
                          <span>{Math.round(h.progress * 100)}%</span>
                        </div>
                        <Progress value={h.progress * 100} tone="accent" className="mt-1.5" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <section className={sectionClass('startups')}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold">My startups</h2>
            <p className="text-sm text-muted">
              Startups you&apos;ve listed. Name, slug, vote threshold, and capital target cannot be
              changed here. Each startup explains why below.
            </p>
          </div>

          {myStartupsError && (
            <Notice tone="no" className="mb-4">
              {myStartupsError}
            </Notice>
          )}

          {myStartups === null ? (
            <p className="text-sm text-muted">Loading your startups...</p>
          ) : myStartups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
              <p className="text-sm text-muted">
                This is where startups you list will appear. Start building your founder page to get votes and raise capital.
              </p>
              <Link
                href="/list"
                className={buttonClass('secondary', 'sm', 'mt-4')}
              >
                List a startup
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {myStartups.map((s) => (
                <div key={s.id} className="rounded-lg border border-line p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-ink">{s.name}</p>
                        <PhaseBadge phase={s.phase} />
                      </div>
                      <Link
                        href={`/startup/${s.slug}`}
                        className="mt-1 inline-block text-xs font-semibold text-accent hover:text-accent-hover"
                      >
                        View public page
                      </Link>

                      <MyStartupStats startup={s} />
                    </div>

                    {editingStartupId !== s.id && (
                      <button
                        type="button"
                        onClick={() => startEditingStartup(s)}
                        className={buttonClass('secondary', 'sm')}
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 text-[13px] leading-relaxed text-muted sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-ink">Name & slug fixed:</span> the
                      slug is the public URL people have already shared, and renaming mid-raise
                      would let a startup become something other than what backers evaluated.
                    </p>
                    <p>
                      <span className="font-medium text-ink">Threshold & target fixed:</span>{' '}
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
                      selectedLogoFile={selectedLogoFile}
                      onLogoFileSelect={setSelectedLogoFile}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={sectionClass('activity')}>
          <h2 className="text-[15px] font-semibold">Past votes</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Startups you backed that reached their vote threshold and moved on to raising capital.
            Those votes were consumed as part of the community validation.
          </p>
          {voteState === null ? (
            <p className="text-sm text-muted">Loading past votes...</p>
          ) : voteState.burned.length === 0 ? (
            <p className="text-sm text-muted">No startups have crossed the threshold with your support yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {voteState.burned.map((pos) => (
                <Link
                  key={pos.startup_id}
                  href={`/startup/${pos.slug}`}
                  className="flex gap-4 rounded-lg border border-line p-4 transition-colors hover:border-line-strong hover:bg-canvas sm:items-center"
                >
                  <Avatar name={pos.name} src={pos.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-ink">{pos.name}</p>
                      <Badge tone={pos.direction === 'yes' ? 'yes' : 'no'}>{pos.direction === 'yes' ? 'Yes' : 'No'}</Badge>
                      <Badge tone="yes">Validated</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      {formatVoteCount(pos.votes)} votes contributed before the threshold was reached
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="deposit" className={sectionClass('account')}>
          <h2 className="mb-4 text-[15px] font-semibold">Deposit</h2>
          <div className="mb-5 inline-flex rounded-lg bg-subtle p-0.5">
            {(['devnet', 'embedded', 'card'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setDepositMode(m)}
                className={cx(
                  'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                  depositMode === m ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-muted hover:text-ink',
                )}
              >
                {depositLabels[m]}
              </button>
            ))}
          </div>

          {depositMode === 'devnet' ? (
            <>
              {devnetMessage && (
                <Notice tone={devnetMessage.type === 'error' ? 'no' : 'yes'} className="mb-4">
                  {devnetMessage.text}
                </Notice>
              )}
              <form onSubmit={handleDevnetDeposit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount USDC"
                  disabled={devnetLoading}
                  className={cx(inputClass, 'h-10 sm:w-48')}
                />
                <button
                  type="submit"
                  disabled={devnetLoading}
                  className={buttonClass('primary', 'md', 'h-10')}
                >
                  {devnetLoading ? 'Depositing…' : 'Get devnet USDC'}
                </button>
              </form>
            </>
          ) : depositMode === 'embedded' ? (
            <EmbeddedDeposit onSuccess={fetchProfile} />
          ) : (
            <div className="flex flex-col gap-3">
              {cardMessage && (
                <Notice tone={cardMessage.type === 'error' ? 'no' : 'yes'} className="mb-4">
                  {cardMessage.text}
                </Notice>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="number"
                  step="0.01"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                  placeholder="Amount USDC (optional)"
                  disabled={cardLoading}
                  className={cx(inputClass, 'h-10 sm:w-48')}
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
                  className={buttonClass('primary', 'md', 'h-10')}
                >
                  {cardLoading ? 'Opening…' : 'Buy USDC with card'}
                </button>
              </div>
              <p className="text-[13px] text-muted">
                Funds go to your embedded Solana wallet. Once they arrive, use the Wallet tab to credit your platform balance.
              </p>
            </div>
          )}
        </section>

        <section id="withdraw" className={sectionClass('account')}>
          <h2 className="mb-4 text-[15px] font-semibold">Withdraw</h2>
          {withdrawMessage && (
            <Notice tone={withdrawMessage.type === 'error' ? 'no' : 'yes'} className="mb-4">
              {withdrawMessage.text}
            </Notice>
          )}
          <form onSubmit={handleWithdraw} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="number"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount USDC"
              disabled={withdrawLoading}
              className={cx(inputClass, 'h-10 sm:w-48')}
            />
            <input
              type="text"
              value={withdrawWallet}
              onChange={(e) => setWithdrawWallet(e.target.value)}
              placeholder="Destination wallet address"
              disabled={withdrawLoading}
              className={cx(inputClass, 'h-10 sm:flex-1')}
            />
            <button
              type="submit"
              disabled={withdrawLoading}
              className={buttonClass('primary', 'md', 'h-10')}
            >
              {withdrawLoading ? 'Withdrawing...' : 'Withdraw'}
            </button>
          </form>
        </section>

        <section className={sectionClass('claims')}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold">Token claims</h2>
            <p className="text-sm text-muted">
              Tokens you are owed from graduated startups. The platform pays the fee; you do not need gas or wallet approval.
            </p>
          </div>
          <ProfileGraduationClaims />
        </section>
    </div>
  )
}
