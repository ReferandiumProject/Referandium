'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/app/context/UserContext'
import { formatUsd, formatVoteCount } from '@/lib/format'
import { Card, Notice, Skeleton, buttonClass, cx, inputClass as baseInput } from '@/app/components/ui'

const STAGE_OPTIONS = ['Idea', 'MVP', 'Seed', 'Series A+']

const VOTE_THRESHOLD_MIN = 1_000
const VOTE_THRESHOLD_MAX = 1_000_000
const CAPITAL_TARGET_MIN = 100
const CAPITAL_TARGET_MAX = 1_000_000
const LISTING_FEE_USDC = 8

type FormErrors = {
  name?: string
  description?: string
  vote_threshold?: string
  capital_target?: string
}

export default function ListStartupPage() {
  const router = useRouter()
  const { authenticated, ready, login, getAccessToken } = usePrivy()
  const { dbUser, loading: userLoading } = useUser()

  const [balance, setBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [voteThreshold, setVoteThreshold] = useState('')
  const [capitalTarget, setCapitalTarget] = useState('')
  const [pitch, setPitch] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [stage, setStage] = useState('')

  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pendingListingKey, setPendingListingKey] = useState<string | null>(null)
  const pendingListingKeyRef = useRef<string | null>(null)

  const canAfford = balance === null ? false : balance >= LISTING_FEE_USDC

  useEffect(() => {
    if (!authenticated || !dbUser) {
      setBalance(null)
      return
    }

    let cancelled = false
    const fetchBalance = async () => {
      setBalanceLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Not authenticated')
        const res = await fetch('/api/balance', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load balance')
        if (!cancelled) setBalance(Number(json.data?.available_usdc ?? 0))
      } catch (err: any) {
        console.error('[list] balance fetch error:', err)
        if (!cancelled) setBalance(null)
      } finally {
        if (!cancelled) setBalanceLoading(false)
      }
    }

    fetchBalance()
    return () => {
      cancelled = true
    }
  }, [authenticated, dbUser, getAccessToken])

  const isSignedIn = authenticated && ready
  const isAuthLoading = !ready || userLoading

  const validate = (): boolean => {
    const next: FormErrors = {}
    const trimmedName = name.trim()
    if (!trimmedName) next.name = 'Startup name is required'

    const trimmedDescription = description.trim()
    if (!trimmedDescription) next.description = 'Description is required'

    const threshold = Number(voteThreshold.replace(/,/g, ''))
    if (
      !Number.isInteger(threshold) ||
      threshold < VOTE_THRESHOLD_MIN ||
      threshold > VOTE_THRESHOLD_MAX
    ) {
      next.vote_threshold = `Vote threshold must be between ${formatVoteCount(VOTE_THRESHOLD_MIN)} and ${formatVoteCount(VOTE_THRESHOLD_MAX)}`
    }

    const target = Number(capitalTarget.replace(/,/g, ''))
    if (
      !Number.isFinite(target) ||
      target < CAPITAL_TARGET_MIN ||
      target > CAPITAL_TARGET_MAX
    ) {
      next.capital_target = `Capital target must be between ${formatUsd(CAPITAL_TARGET_MIN)} and ${formatUsd(CAPITAL_TARGET_MAX)}`
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)

    if (!validate()) return
    if (!dbUser || !canAfford) return

    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setServerError('Not authenticated')
        return
      }

      const idempotencyKey =
        pendingListingKeyRef.current ?? (crypto as any).randomUUID()
      if (!pendingListingKeyRef.current) {
        pendingListingKeyRef.current = idempotencyKey
        setPendingListingKey(idempotencyKey)
      }

      const res = await fetch('/api/startup-listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          vote_threshold: Number(voteThreshold.replace(/,/g, '')),
          capital_target: Number(capitalTarget.replace(/,/g, '')),
          pitch: pitch.trim() || null,
          website: website.trim() || null,
          twitter: twitter.trim() || null,
          stage: stage || null,
          idempotency_key: idempotencyKey,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (res.status === 402) {
        setServerError(
          'Insufficient balance. Listing costs 8 USDC. Deposit funds in your profile to continue.'
        )
        return
      }

      if (!res.ok) {
        setServerError(json.error || 'Failed to create listing')
        return
      }

      // Clear the key on any final 2xx so a later submit is a new attempt.
      pendingListingKeyRef.current = null
      setPendingListingKey(null)

      router.push(`/startup/${json.slug}`)
    } catch (err: any) {
      console.error('[list] submit error:', err)
      setServerError(err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = baseInput
  const labelClass = 'mb-1.5 block text-sm font-medium text-ink'
  const hintClass = 'mt-1.5 text-[13px] leading-relaxed text-muted'
  const errorClass = 'mt-1.5 text-[13px] text-no'

  const SignInPrompt = () => (
    <div className="mx-auto w-full max-w-xl px-4 py-24 sm:px-6">
      <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">List your startup</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Sign in to create a listing, set your vote threshold and start raising capital.
      </p>
      <button onClick={login} className={buttonClass('primary', 'lg', 'mt-8')}>
        Sign in to continue
      </button>
    </div>
  )

  if (!ready) {
    if (authenticated) {
      return (
        <div className="mx-auto w-full max-w-page px-4 pb-20 pt-12 sm:px-6">
          <Skeleton className="h-9 w-64" />
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </div>
      )
    }
    return <SignInPrompt />
  }

  if (!authenticated) {
    return <SignInPrompt />
  }

  const section = (title: string, description: string) => (
    <div className="mb-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{description}</p>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-page px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">List your startup</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Create a public listing and set the terms under which it becomes eligible to raise capital.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            {section('About the startup', 'Shown on the listing and in search.')}
            <div className="space-y-5">
              <div>
                <label htmlFor="name" className={labelClass}>
                  Startup name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Launchpad"
                  className={cx(inputClass, 'h-10')}
                />
                {errors.name && <p className={errorClass}>{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="description" className={labelClass}>
                  Short description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does your startup do?"
                  className={inputClass}
                />
                {errors.description && <p className={errorClass}>{errors.description}</p>}
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label htmlFor="stage" className={labelClass}>
                    Stage
                  </label>
                  <select
                    id="stage"
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className={cx(inputClass, 'h-10')}
                  >
                    <option value="">Select stage</option>
                    {STAGE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="website" className={labelClass}>
                    Website
                  </label>
                  <input
                    id="website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://..."
                    className={cx(inputClass, 'h-10')}
                  />
                </div>

                <div>
                  <label htmlFor="twitter" className={labelClass}>
                    Twitter / X
                  </label>
                  <input
                    id="twitter"
                    type="text"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="@handle"
                    className={cx(inputClass, 'h-10')}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pitch" className={labelClass}>
                  Pitch
                </label>
                <textarea
                  id="pitch"
                  rows={4}
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  placeholder="Tell supporters why they should vote for your startup..."
                  className={inputClass}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            {section('Raise terms', 'These decide when the raise opens and how much it aims for.')}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="vote_threshold" className={labelClass}>
                  Vote threshold
                </label>
                <input
                  id="vote_threshold"
                  type="number"
                  min={VOTE_THRESHOLD_MIN}
                  max={VOTE_THRESHOLD_MAX}
                  step={1}
                  value={voteThreshold}
                  onChange={(e) => setVoteThreshold(e.target.value)}
                  placeholder="10000"
                  className={cx(inputClass, 'num h-10')}
                />
                {errors.vote_threshold ? (
                  <p className={errorClass}>{errors.vote_threshold}</p>
                ) : (
                  <p className={hintClass}>
                    Net yes votes needed before the startup can raise. Each user gets 100 free votes a
                    day, so 10,000 is roughly 100 user-days of support.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="capital_target" className={labelClass}>
                  Capital target (USDC)
                </label>
                <input
                  id="capital_target"
                  type="number"
                  min={CAPITAL_TARGET_MIN}
                  max={CAPITAL_TARGET_MAX}
                  step="1"
                  value={capitalTarget}
                  onChange={(e) => setCapitalTarget(e.target.value)}
                  placeholder="50000"
                  className={cx(inputClass, 'num h-10')}
                />
                {errors.capital_target ? (
                  <p className={errorClass}>{errors.capital_target}</p>
                ) : (
                  <p className={hintClass}>
                    The amount to raise once validated. It also sets market depth and can&apos;t be
                    changed after the raise starts.
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Listing fee</h2>
              <span className="num text-[15px] font-semibold">{LISTING_FEE_USDC} USDC</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Charged from your balance when you submit. It&apos;s non-refundable and keeps spam
              listings out.
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
              <span className="text-muted">Your balance</span>
              <span className="num font-medium">
                {balanceLoading ? 'Loading…' : balance === null ? 'Unavailable' : formatUsd(balance)}
              </span>
            </div>
            <Link href="/profile" className="mt-2 inline-block text-[13px] font-medium text-accent hover:underline">
              Deposit funds
            </Link>

            {serverError && (
              <Notice tone="no" className="mt-4">
                {serverError}
              </Notice>
            )}

            <button
              type="submit"
              disabled={submitting || balanceLoading || !canAfford}
              className={buttonClass('primary', 'lg', 'mt-5 w-full')}
            >
              {submitting
                ? 'Submitting…'
                : canAfford
                ? `List startup for ${LISTING_FEE_USDC} USDC`
                : 'Insufficient balance'}
            </button>
            <p className="mt-2 text-center text-xs text-faint">
              The URL may be adjusted if the name is already taken.
            </p>
          </Card>
        </aside>
      </form>
    </div>
  )
}
