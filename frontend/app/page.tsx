'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { formatUsd, formatPrice, formatVoteCount } from '@/lib/format'

type UserPosition = {
  direction: 'yes' | 'no'
  votes: number
}

type CurveInfo = {
  pool_usdc: string
  capital_target: string
  current_price: string
  progress: number
  graduated: boolean
  frozen: boolean
}

type Startup = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  phase: number
  total_yes_votes?: number
  total_no_votes?: number
  vote_threshold?: number
  net?: number
  progress?: number
  user_position?: UserPosition | null
  curve?: CurveInfo
}

type TabKey = 'voting' | 'raising' | 'completed' | 'all'

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

function CardShell({
  startup,
  badge,
  children,
}: {
  startup: Startup
  badge?: ReactNode
  children: ReactNode
}) {
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
            {badge}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#6B7280]">
            {startup.description}
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-5">{children}</div>
    </Link>
  )
}

function PhaseOneCard({ startup }: { startup: Startup }) {
  const totalYes = startup.total_yes_votes ?? 0
  const totalNo = startup.total_no_votes ?? 0
  const net = startup.net ?? 0
  const threshold = startup.vote_threshold ?? 0
  const progress = startup.progress ?? 0
  const totalVotes = totalYes + totalNo
  const yesPct = totalVotes > 0 ? (totalYes / totalVotes) * 100 : 0
  const noPct = totalVotes > 0 ? 100 - yesPct : 0

  return (
    <CardShell
      startup={startup}
      badge={
        startup.user_position && (
          <span
            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              startup.user_position.direction === 'yes'
                ? 'bg-[#10B981]/10 text-[#10B981]'
                : 'bg-[#EF4444]/10 text-[#EF4444]'
            }`}
          >
            You · {startup.user_position.direction === 'yes' ? 'YES' : 'NO'} ·{' '}
            {formatVoteCount(startup.user_position.votes)}
          </span>
        )
      }
    >
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-medium">
          <span className="text-[#10B981]">YES {formatVoteCount(totalYes)}</span>
          <span className="text-[#EF4444]">NO {formatVoteCount(totalNo)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
          {totalVotes > 0 ? (
            <div className="flex h-full w-full">
              <div className="h-full bg-[#10B981]" style={{ width: `${yesPct}%` }} />
              <div className="h-full bg-[#EF4444]" style={{ width: `${noPct}%` }} />
            </div>
          ) : (
            <div className="h-full w-full bg-[#E5E7EB]" />
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-[#6B7280]">
          <span className="text-[#111827]">{Math.round(progress)}%</span>
          <span>
            {formatVoteCount(net)} / {formatVoteCount(threshold)} votes
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
          <div
            className="h-full bg-[#3B82F6] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
    </CardShell>
  )
}

function PhaseTwoCard({ startup }: { startup: Startup }) {
  const curve = startup.curve
  const progress = curve?.progress ?? 0
  const raised = curve?.pool_usdc ?? '0'
  const target = curve?.capital_target ?? '0'
  const price = curve?.current_price ?? '0'

  return (
    <CardShell
      startup={startup}
      badge={
        <span className="flex-shrink-0 rounded-full bg-[#8B5CF6]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8B5CF6]">
          Raising
        </span>
      }
    >
      <div className="rounded-lg bg-[#8B5CF6]/5 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-[#6B7280]">
          <span className="font-semibold text-[#8B5CF6]">
            {Math.round(progress)}% raised
          </span>
          <span>
            {formatUsd(raised)} / {formatUsd(target)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
          <div
            className="h-full bg-[#8B5CF6] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-[#6B7280]">
        <span>Current token price</span>
        <span className="font-medium text-[#111827]">${formatPrice(price)}</span>
      </div>
      {curve?.frozen && (
        <p className="text-xs font-medium text-[#B45309]">Trading temporarily halted</p>
      )}
    </CardShell>
  )
}

function PhaseThreeCard({ startup }: { startup: Startup }) {
  const curve = startup.curve
  const raised = curve?.pool_usdc ?? curve?.capital_target ?? '0'

  return (
    <CardShell
      startup={startup}
      badge={
        <span className="flex-shrink-0 rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#10B981]">
          Completed
        </span>
      }
    >
      <div className="rounded-lg bg-[#10B981]/5 p-3">
        <p className="text-xs text-[#6B7280]">Raise completed</p>
        <p className="mt-1 text-lg font-semibold text-[#10B981]">{formatUsd(raised)}</p>
      </div>
      <p className="text-xs text-[#6B7280]">
        The raise is finished. The on-chain token is being prepared for issuance.
      </p>
    </CardShell>
  )
}

function StartupCard({ startup }: { startup: Startup }) {
  if (startup.phase === 2) return <PhaseTwoCard startup={startup} />
  if (startup.phase === 3) return <PhaseThreeCard startup={startup} />
  return <PhaseOneCard startup={startup} />
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
  const [tab, setTab] = useState<TabKey>('voting')

  const authState = useMemo(
    () => (ready ? (authenticated ? 'auth' : 'anon') : 'pending'),
    [ready, authenticated]
  )

  const counts = useMemo(() => {
    const list = startups ?? []
    return {
      voting: list.filter((s) => s.phase === 1).length,
      raising: list.filter((s) => s.phase === 2).length,
      completed: list.filter((s) => s.phase >= 3).length,
      all: list.length,
    }
  }, [startups])

  const filteredStartups = useMemo(() => {
    const list = startups ?? []
    if (tab === 'all') return list
    if (tab === 'voting') return list.filter((s) => s.phase === 1)
    if (tab === 'raising') return list.filter((s) => s.phase === 2)
    return list.filter((s) => s.phase >= 3)
  }, [startups, tab])

  const emptyCopy: Record<TabKey, { title: string; body: string }> = {
    voting: {
      title: 'No startups in voting phase',
      body: 'Check back soon for new startups to vote on.',
    },
    raising: {
      title: 'No startups are currently raising',
      body: 'Startups appear here once they cross the vote threshold.',
    },
    completed: {
      title: 'No completed raises yet',
      body: 'Completed raises will show up here once a capital target is reached.',
    },
    all: {
      title: 'No startups yet',
      body: 'Check back soon.',
    },
  }

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

        <div className="mb-8 flex flex-wrap gap-2 sm:mb-10">
          {(
            [
              { key: 'voting', label: 'Voting' },
              { key: 'raising', label: 'Raising' },
              { key: 'completed', label: 'Completed' },
              { key: 'all', label: 'All' },
            ] as { key: TabKey; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === key
                  ? 'bg-[#111827] text-white'
                  : 'bg-white text-[#6B7280] hover:text-[#111827] border border-[#E5E7EB]'
              }`}
            >
              {label}
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                  tab === key ? 'bg-white/20 text-white' : 'bg-[#F3F4F6] text-[#6B7280]'
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredStartups.length === 0 ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white py-16 text-center shadow-sm">
            <p className="text-lg font-medium text-[#111827]">{emptyCopy[tab].title}</p>
            <p className="mt-2 text-sm text-[#6B7280]">{emptyCopy[tab].body}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStartups.map((startup) => (
              <StartupCard key={startup.id} startup={startup} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
