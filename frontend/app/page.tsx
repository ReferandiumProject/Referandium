'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { formatUsd, formatPrice, formatVoteCount } from '@/lib/format'
import { Badge, EmptyState, Logo, Notice, Progress, Segmented, Skeleton, SplitBar } from './components/ui'

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

function Row({
  startup,
  badge,
  middle,
  right,
}: {
  startup: Startup
  badge?: ReactNode
  middle: ReactNode
  right: ReactNode
}) {
  return (
    <Link
      href={`/startup/${startup.slug}`}
      className="grid gap-4 px-4 py-5 transition-colors hover:bg-canvas sm:px-5 md:grid-cols-[minmax(0,1fr)_260px_170px] md:items-center md:gap-8"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <Logo name={startup.name} src={startup.logo_url} size={44} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold">{startup.name}</h3>
            {badge}
          </div>
          {startup.description && (
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">{startup.description}</p>
          )}
        </div>
      </div>
      <div className="min-w-0">{middle}</div>
      <div className="min-w-0">{right}</div>
    </Link>
  )
}

function VotingRow({ startup }: { startup: Startup }) {
  const totalYes = startup.total_yes_votes ?? 0
  const totalNo = startup.total_no_votes ?? 0
  const net = startup.net ?? 0
  const threshold = startup.vote_threshold ?? 0
  const progress = startup.progress ?? 0
  const pos = startup.user_position

  return (
    <Row
      startup={startup}
      badge={
        pos && (
          <Badge tone={pos.direction === 'yes' ? 'yes' : 'no'}>
            You voted {pos.direction === 'yes' ? 'yes' : 'no'} with {formatVoteCount(pos.votes)}
          </Badge>
        )
      }
      middle={
        <div>
          <div className="num mb-2 flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-yes">Yes {formatVoteCount(totalYes)}</span>
            <span className="font-medium text-no">No {formatVoteCount(totalNo)}</span>
          </div>
          <SplitBar yes={totalYes} no={totalNo} className="h-2" />
        </div>
      }
      right={
        <div>
          <div className="num mb-2 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="font-semibold text-ink">{Math.round(progress)}%</span>
            <span className="truncate text-muted">
              {formatVoteCount(net)} / {formatVoteCount(threshold)} net
            </span>
          </div>
          <Progress value={progress} tone="neutral" />
        </div>
      }
    />
  )
}

function RaisingRow({ startup }: { startup: Startup }) {
  const curve = startup.curve
  const progress = curve?.progress ?? 0
  const raised = curve?.pool_usdc ?? '0'
  const target = curve?.capital_target ?? '0'
  const price = curve?.current_price ?? '0'

  return (
    <Row
      startup={startup}
      badge={
        <>
          <Badge tone="accent">Raising</Badge>
          {curve?.frozen && <Badge tone="warn">Trading paused</Badge>}
        </>
      }
      middle={
        <div>
          <div className="num mb-2 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="font-semibold text-accent">{Math.round(progress)}% raised</span>
            <span className="truncate text-muted">
              {formatUsd(raised)} / {formatUsd(target)}
            </span>
          </div>
          <Progress value={progress} tone="accent" className="h-2" />
        </div>
      }
      right={
        <div className="md:text-right">
          <p className="text-[13px] text-muted">Token price</p>
          <p className="num text-[15px] font-semibold">${formatPrice(price)}</p>
        </div>
      }
    />
  )
}

function CompletedRow({ startup }: { startup: Startup }) {
  const curve = startup.curve
  const raised = curve?.pool_usdc ?? curve?.capital_target ?? '0'

  return (
    <Row
      startup={startup}
      badge={<Badge tone="yes">Raise complete</Badge>}
      middle={
        <div>
          <p className="text-[13px] text-muted">Raised</p>
          <p className="num text-[15px] font-semibold text-yes">{formatUsd(raised)}</p>
        </div>
      }
      right={<p className="text-[13px] leading-snug text-muted md:text-right">Token is being prepared for issuance</p>}
    />
  )
}

function StartupRow({ startup }: { startup: Startup }) {
  if (startup.phase === 2) return <RaisingRow startup={startup} />
  if (startup.phase === 3) return <CompletedRow startup={startup} />
  return <VotingRow startup={startup} />
}

function SkeletonRow() {
  return (
    <div className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_260px_170px] md:items-center md:gap-8">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-2 w-full" />
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
    <div className="mx-auto w-full max-w-page px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
      <header className="max-w-2xl">
        <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[44px]">
          Vote on startups. The ones the crowd backs go on to raise.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          You get free voting tokens every day. Vote yes on startups you believe in and no on the
          ones you don&apos;t. A startup that reaches its net vote threshold opens a USDC raise.
        </p>
      </header>

      <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-3">
        <Segmented<TabKey>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'voting', label: 'Voting', count: counts.voting },
            { key: 'raising', label: 'Raising', count: counts.raising },
            { key: 'completed', label: 'Completed', count: counts.completed },
            { key: 'all', label: 'All', count: counts.all },
          ]}
        />
        {tab === 'voting' && !loading && filteredStartups.length > 0 && (
          <p className="hidden text-[13px] text-muted md:block">Net votes are yes minus no</p>
        )}
      </div>

      {error && (
        <Notice tone="no" className="mb-4">
          {error}
        </Notice>
      )}

      {loading ? (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {[...Array(6)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filteredStartups.length === 0 ? (
        <EmptyState title={emptyCopy[tab].title} description={emptyCopy[tab].body} />
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {filteredStartups.map((startup) => (
            <StartupRow key={startup.id} startup={startup} />
          ))}
        </div>
      )}
    </div>
  )
}
