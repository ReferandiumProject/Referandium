'use client'

import { useEffect, useMemo, useState } from 'react'
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
  user_position?: UserPosition | null
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
        className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
      />
    )
  }

  return (
    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#3B82F6] text-sm font-bold text-white">
      {getInitials(name)}
    </div>
  )
}

function StartupCard({ startup }: { startup: Startup }) {
  const totalVotes = startup.total_yes_votes + startup.total_no_votes
  const yesPct =
    totalVotes > 0 ? (startup.total_yes_votes / totalVotes) * 100 : 0
  const noPct = totalVotes > 0 ? 100 - yesPct : 0

  return (
    <Link
      href={`/startup/${startup.slug}`}
      className="group flex flex-col rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition-colors duration-200 hover:border-[#3B82F6]/50"
    >
      <div className="mb-4 flex items-start gap-3">
        <Avatar name={startup.name} src={startup.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-[#111827]">
              {startup.name}
            </h3>
            {startup.user_position && (
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
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
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#6B7280]">
            {startup.description}
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <span className="text-[#10B981]">YES {startup.total_yes_votes}</span>
            <span className="text-[#EF4444]">NO {startup.total_no_votes}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            {totalVotes > 0 ? (
              <div className="flex h-full w-full">
                <div
                  className="h-full bg-[#10B981]"
                  style={{ width: `${yesPct}%` }}
                />
                <div
                  className="h-full bg-[#EF4444]"
                  style={{ width: `${noPct}%` }}
                />
              </div>
            ) : (
              <div className="h-full w-full bg-[#E5E7EB]" />
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-[#6B7280]">
            <span className="text-[#111827]">
              {Math.round(startup.progress)}%
            </span>
            <span>
              {startup.net.toLocaleString()} / {startup.vote_threshold.toLocaleString()} votes
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full bg-[#3B82F6] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, startup.progress))}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="h-11 w-11 flex-shrink-0 animate-pulse rounded-lg bg-[#E5E7EB]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[#E5E7EB]" />
          <div className="h-3 w-full animate-pulse rounded bg-[#E5E7EB]" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-[#E5E7EB]" />
        </div>
      </div>
      <div className="mt-auto space-y-4">
        <div className="h-2 w-full animate-pulse rounded-full bg-[#E5E7EB]" />
        <div className="h-2 w-full animate-pulse rounded-full bg-[#E5E7EB]" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const { authenticated, getAccessToken, ready } = usePrivy()
  const [startups, setStartups] = useState<Startup[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const authState = useMemo(
    () => (ready ? (authenticated ? 'auth' : 'anon') : 'pending'),
    [ready, authenticated]
  )

  useEffect(() => {
    if (authState === 'pending') return

    let cancelled = false

    async function fetchStartups() {
      setLoading(true)
      setError(null)

      try {
        const headers: Record<string, string> = {}
        if (authenticated) {
          const token = await getAccessToken()
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
        }

        const res = await fetch('/api/startup-votes/list', { headers })
        if (!res.ok) {
          throw new Error(`Failed to load startups (${res.status})`)
        }

        const data = await res.json()
        if (!cancelled) {
          setStartups(Array.isArray(data) ? data : [])
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load startups')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchStartups()

    return () => {
      cancelled = true
    }
  }, [authState, authenticated, getAccessToken])

  return (
    <div className="min-h-screen bg-[#F9FAFB] px-4 py-10 text-[#111827] sm:py-14">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 text-center sm:mb-14">
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl md:text-5xl">
            Startup Sentiment
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#6B7280] sm:text-lg">
            You get free daily voting tokens. Back the startups you believe in or reject the ones
            you don&apos;t. Startups that reach their vote threshold move on to raise capital.
          </p>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-[#EF4444]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : startups && startups.length === 0 ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white py-16 text-center shadow-sm">
            <p className="text-lg font-medium text-[#111827]">No startups in voting phase</p>
            <p className="mt-2 text-sm text-[#6B7280]">
              Check back soon for new startups to vote on.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {startups?.map((startup) => (
              <StartupCard key={startup.id} startup={startup} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
