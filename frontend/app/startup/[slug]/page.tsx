'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'

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
        className="h-16 w-16 flex-shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
      />
    )
  }

  return (
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-[#3B82F6] text-xl font-bold text-white sm:h-20 sm:w-20">
      {getInitials(name)}
    </div>
  )
}

function SentimentBar({ yes, no }: { yes: number; no: number }) {
  const total = yes + no
  const yesPct = total > 0 ? (yes / total) * 100 : 0
  const noPct = total > 0 ? 100 - yesPct : 0

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span className="text-[#10B981]">YES {yes.toLocaleString()}</span>
        <span className="text-[#EF4444]">NO {no.toLocaleString()}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
        {total > 0 ? (
          <div className="flex h-full w-full">
            <div className="h-full bg-[#10B981]" style={{ width: `${yesPct}%` }} />
            <div className="h-full bg-[#EF4444]" style={{ width: `${noPct}%` }} />
          </div>
        ) : (
          <div className="h-full w-full bg-[#E5E7EB]" />
        )}
      </div>
    </div>
  )
}

function ProgressBar({ progress, net, threshold }: { progress: number; net: number; threshold: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-[#6B7280]">
        <span className="font-medium text-[#111827]">{Math.round(progress)}%</span>
        <span>
          {net.toLocaleString()} / {threshold.toLocaleString()} votes
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
        <div
          className="h-full bg-[#3B82F6] transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  )
}

function VotePanel({
  startup,
  balance,
  onCast,
  onFlip,
  onWithdraw,
  loading,
  error,
  success,
}: {
  startup: Startup
  balance: Balance | null
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
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-[#111827]">Have a say?</h3>
        <p className="mb-4 text-sm text-[#6B7280]">
          Sign in to get free daily voting tokens and support or reject this startup.
        </p>
        <button
          onClick={() => login()}
          className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
        >
          Sign In
        </button>
      </div>
    )
  }

  if (startup.phase !== 1) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-[#111827]">Voting is closed</h3>
        <p className="text-sm text-[#6B7280]">
          This startup passed community validation and has moved on to raising capital.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      {success && (
        <div className="mb-4 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-3 text-sm text-[#10B981]">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
          {error}
        </div>
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
    </div>
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
      <h3 className="mb-1 text-lg font-semibold text-[#111827]">Cast your votes</h3>
      <p className="mb-5 text-sm text-[#6B7280]">
        You get 100 free voting tokens each day. Unused tokens expire at the end of the day. Any
        votes you withdrew from other startups sit in your pool and can be redeployed here.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setDirection('yes')}
          className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
            direction === 'yes'
              ? 'border-[#10B981] bg-[#10B981]/10 text-[#10B981]'
              : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]'
          }`}
        >
          Support (YES)
        </button>
        <button
          type="button"
          onClick={() => setDirection('no')}
          className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
            direction === 'no'
              ? 'border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]'
              : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]'
          }`}
        >
          Reject (NO)
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
          Votes to deploy
        </label>
        <input
          type="number"
          min={1}
          max={totalSpendable}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition-colors focus:border-[#3B82F6]"
        />
        <p className="mt-1.5 text-xs text-[#6B7280]">
          Available: {totalSpendable.toLocaleString()} votes
        </p>
      </div>

      <button
        type="submit"
        disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > totalSpendable}
        className="w-full rounded-lg bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Submitting...' : direction === 'yes' ? 'Vote YES' : 'Vote NO'}
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
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#111827]">Your position</h3>
          <p className="text-sm text-[#6B7280]">
            You have deployed {position.votes.toLocaleString()} votes to{' '}
            <span className={isYes ? 'text-[#10B981]' : 'text-[#EF4444]'}>
              {isYes ? 'YES' : 'NO'}
            </span>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
            isYes
              ? 'bg-[#10B981]/10 text-[#10B981]'
              : 'bg-[#EF4444]/10 text-[#EF4444]'
          }`}
        >
          {isYes ? 'Supporting' : 'Rejecting'}
        </span>
      </div>

      {mode === null ? (
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => setMode('add')}
            className="w-full rounded-lg bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            Add more votes ({isYes ? 'YES' : 'NO'})
          </button>
          <button
            onClick={() => onFlip()}
            disabled={loading}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change my mind
          </button>
          <button
            onClick={() => setMode('withdraw')}
            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB]"
          >
            Withdraw votes
          </button>
        </div>
      ) : mode === 'add' ? (
        <form onSubmit={handleAdd}>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Additional {isYes ? 'YES' : 'NO'} votes
          </label>
          <input
            type="number"
            min={1}
            max={totalSpendable}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="mb-3 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition-colors focus:border-[#3B82F6]"
          />
          <p className="mb-4 text-xs text-[#6B7280]">
            Available: {totalSpendable.toLocaleString()} votes
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > totalSpendable}
              className="flex-1 rounded-lg bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add votes'}
            </button>
            <button
              type="button"
              onClick={() => { setMode(null); setAmount('') }}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleWithdraw}>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Votes to withdraw
          </label>
          <input
            type="number"
            min={1}
            max={position.votes}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="mb-3 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition-colors focus:border-[#3B82F6]"
          />
          <p className="mb-4 text-xs text-[#6B7280]">
            Deployed: {position.votes.toLocaleString()} votes
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > position.votes}
              className="flex-1 rounded-lg bg-[#EF4444] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Withdrawing...' : 'Withdraw'}
            </button>
            <button
              type="button"
              onClick={() => { setMode(null); setAmount('') }}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function StartupDetailPage() {
  const params = useParams() as { slug?: string } | null
  const slug = params?.slug ?? ''
  const { authenticated, getAccessToken, ready } = usePrivy()

  const [startup, setStartup] = useState<Startup | null>(null)
  const [startupLoading, setStartupLoading] = useState(true)
  const [startupError, setStartupError] = useState<string | null>(null)

  const [balance, setBalance] = useState<Balance | null>(null)

  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const authState = useMemo(
    () => (ready ? (authenticated ? 'auth' : 'anon') : 'pending'),
    [ready, authenticated]
  )

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    if (authenticated) {
      const token = await getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
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
    action: () => Promise<T>,
    successMessage: string,
    phaseClosedMessage: string
  ) {
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const result = await action()
      const closed = (result as any)?.phase_closed === true
      if (closed) {
        setActionSuccess(
          phaseClosedMessage
        )
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

  async function castVote(direction: 'yes' | 'no', votes: number) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/startup-votes/cast', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, direction, votes }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Cast failed (${res.status})`)
    }
    return data
  }

  async function flipVote() {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/startup-votes/flip', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Flip failed (${res.status})`)
    }
    return data
  }

  async function withdrawVote(votes: number) {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/startup-votes/withdraw', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup?.id, votes }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || `Withdraw failed (${res.status})`)
    }
    return data
  }

  if (startupLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] px-4 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="h-32 animate-pulse rounded-xl bg-[#E5E7EB]" />
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-[#E5E7EB]" />
          </div>
        </div>
      </div>
    )
  }

  if (startupError) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] px-4 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
            <h1 className="mb-2 text-xl font-semibold text-[#111827]">Startup not found</h1>
            <p className="mb-6 text-sm text-[#6B7280]">
              We couldn&apos;t find a startup called <span className="font-medium">{slug}</span>.
            </p>
            <Link
              href="/"
              className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
            >
              Back to startups
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!startup) return null

  return (
    <div className="min-h-screen bg-[#F9FAFB] px-4 py-10 text-[#111827]">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 flex items-start gap-4 sm:gap-6">
                <Avatar name={startup.name} src={startup.logo_url} />
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
                    {startup.name}
                  </h1>
                  {startup.user_position && (
                    <span
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                        startup.user_position.direction === 'yes'
                          ? 'bg-[#10B981]/10 text-[#10B981]'
                          : 'bg-[#EF4444]/10 text-[#EF4444]'
                      }`}
                    >
                      You · {startup.user_position.direction === 'yes' ? 'YES' : 'NO'} ·{' '}
                      {startup.user_position.votes}
                    </span>
                  )}
                </div>
              </div>

              <p className="mb-8 text-base leading-relaxed text-[#6B7280]">
                {startup.description}
              </p>

              <div className="space-y-6">
                <SentimentBar yes={startup.total_yes_votes} no={startup.total_no_votes} />
                <ProgressBar
                  progress={startup.progress}
                  net={startup.net}
                  threshold={startup.vote_threshold}
                />
              </div>

              {startup.phase !== 1 && (
                <div className="mt-8 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-4 text-sm text-[#10B981]">
                  Voting has closed. This startup reached its community threshold and is now moving
                  on to raise capital.
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <VotePanel
              startup={startup}
              balance={balance}
              onCast={(direction, votes) =>
                handleAction(
                  () => castVote(direction, votes),
                  `Votes cast successfully.`,
                  `This startup just crossed its vote threshold. Voting is now closed and your deployed votes were consumed in the final count.`
                )
              }
              onFlip={() =>
                handleAction(
                  () => flipVote(),
                  `Your position was flipped.`,
                  `This startup just crossed its vote threshold. Voting is now closed and your deployed votes were consumed in the final count.`
                )
              }
              onWithdraw={(votes) =>
                handleAction(
                  () => withdrawVote(votes),
                  `Votes withdrawn back to your pool.`,
                  `This startup just crossed its vote threshold. Voting is now closed and your withdrawn votes returned to your pool.`
                )
              }
              loading={actionLoading}
              error={actionError}
              success={actionSuccess}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
