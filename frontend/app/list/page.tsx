'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/app/context/UserContext'
import { formatUsd, formatVoteCount } from '@/lib/format'

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
  const [logoUrl, setLogoUrl] = useState('')
  const [stage, setStage] = useState('')

  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
          logo_url: logoUrl.trim() || null,
          stage: stage || null,
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

      router.push(`/startup/${json.slug}`)
    } catch (err: any) {
      console.error('[list] submit error:', err)
      setServerError(err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]'
  const labelClass = 'mb-1.5 block text-sm font-medium text-[#374151]'
  const hintClass = 'mt-1 text-xs text-[#6B7280]'

  const SignInPrompt = () => (
    <main className="min-h-screen bg-white px-4 py-16 text-[#111827]">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">
          List your startup
        </h1>
        <p className="mt-4 text-base text-[#6B7280]">
          Sign in to create a listing, set your vote threshold, and start
          raising capital.
        </p>
        <button
          onClick={login}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
        >
          Sign in
        </button>
      </div>
    </main>
  )

  if (!ready) {
    if (authenticated) {
      return (
        <main className="min-h-screen bg-white px-4 py-12 text-[#111827]">
          <div className="mx-auto max-w-2xl">
            <div className="h-8 w-48 animate-pulse rounded bg-[#E5E7EB]" />
            <div className="mt-6 space-y-4">
              <div className="h-24 animate-pulse rounded-lg bg-[#E5E7EB]" />
              <div className="h-12 animate-pulse rounded-lg bg-[#E5E7EB]" />
              <div className="h-12 animate-pulse rounded-lg bg-[#E5E7EB]" />
            </div>
          </div>
        </main>
      )
    }
    return <SignInPrompt />
  }

  if (!authenticated) {
    return <SignInPrompt />
  }

  return (
    <main className="min-h-screen bg-white px-4 py-10 text-[#111827]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
            List your startup
          </h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            Create a public listing and set the terms under which it becomes
            eligible to raise capital.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8"
        >
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
              className={inputClass}
            />
            {errors.name && (
              <p className="mt-1.5 text-xs font-medium text-[#EF4444]">
                {errors.name}
              </p>
            )}
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
            {errors.description && (
              <p className="mt-1.5 text-xs font-medium text-[#EF4444]">
                {errors.description}
              </p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
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
                className={inputClass}
              />
              <p className={hintClass}>
                Net YES votes required before the startup can raise. A higher
                threshold means a longer validation period but a stronger
                signal. With 100 free voting tokens per user per day, a
                threshold of 10,000 means roughly 100 user-days of support.
              </p>
              {errors.vote_threshold && (
                <p className="mt-1.5 text-xs font-medium text-[#EF4444]">
                  {errors.vote_threshold}
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
                className={inputClass}
              />
              <p className={hintClass}>
                The amount the startup will attempt to raise once validated.
                This also shapes market depth and cannot be changed after the
                raise has started.
              </p>
              {errors.capital_target && (
                <p className="mt-1.5 text-xs font-medium text-[#EF4444]">
                  {errors.capital_target}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="stage" className={labelClass}>
                Stage
              </label>
              <select
                id="stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={inputClass}
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
              <label htmlFor="logo_url" className={labelClass}>
                Logo URL
              </label>
              <input
                id="logo_url"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
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
                className={inputClass}
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
                className={inputClass}
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

          <div className="rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] p-4 text-sm text-[#1E40AF]">
            <p className="font-semibold">Listing fee: 8 USDC</p>
            <p className="mt-1">
              This fee is charged from your platform balance when you submit. It
              is non-refundable and helps prevent spam listings.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium">
                {balanceLoading
                  ? 'Loading balance...'
                  : balance === null
                  ? 'Balance unavailable'
                  : `Available balance: ${formatUsd(balance)}`}
              </p>
              <Link
                href="/profile"
                className="text-sm font-semibold text-[#3B82F6] hover:text-blue-700"
              >
                Deposit funds
              </Link>
            </div>
          </div>

          {serverError && (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C]">
              {serverError}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || balanceLoading || !canAfford}
              className="w-full rounded-lg bg-[#3B82F6] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-[#9CA3AF]"
            >
              {submitting
                ? 'Submitting...'
                : canAfford
                ? `List startup for ${LISTING_FEE_USDC} USDC`
                : 'Insufficient balance'}
            </button>
            <p className="mt-2 text-center text-xs text-[#6B7280]">
              The slug may be adjusted if the name is already taken.
            </p>
          </div>
        </form>
      </div>
    </main>
  )
}
