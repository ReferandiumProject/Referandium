'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { formatUsd, formatPrice, formatVoteCount } from '@/lib/format'
import { Badge, CountUp, EmptyState, LiveDot, Logo, Notice, Progress, Segmented, Skeleton, SplitBar, buttonClass } from './components/ui'

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
      className="row-rail group grid gap-4 px-4 py-5 transition-colors duration-200 hover:bg-accent-soft/40 sm:px-5 md:grid-cols-[minmax(0,1fr)_260px_170px] md:items-center md:gap-8"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <Logo name={startup.name} src={startup.logo_url} size={44} className="transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold transition-colors group-hover:text-accent">{startup.name}</h3>
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
            <span className="font-semibold text-yes">
              Yes <CountUp value={totalYes} format={formatVoteCount} />
            </span>
            <span className="font-semibold text-no">
              No <CountUp value={totalNo} format={formatVoteCount} />
            </span>
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

function LiveTally({ startups, loading }: { startups: Startup[]; loading: boolean }) {
  const pool = useMemo(
    () =>
      startups
        .filter((s) => s.phase === 1)
        .sort(
          (a, b) =>
            (b.total_yes_votes ?? 0) + (b.total_no_votes ?? 0) - ((a.total_yes_votes ?? 0) + (a.total_no_votes ?? 0)),
        )
        .slice(0, 5),
    [startups],
  )
  const [i, setI] = useState(0)

  useEffect(() => {
    if (pool.length < 2) return
    const id = setInterval(() => setI((n) => (n + 1) % pool.length), 4200)
    return () => clearInterval(id)
  }, [pool.length])

  const s = pool.length ? pool[i % pool.length] : null
  const yes = s?.total_yes_votes ?? 0
  const no = s?.total_no_votes ?? 0
  const total = yes + no
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute -inset-y-10 inset-x-0 -z-10 sm:-inset-10">
        <div className="absolute left-0 top-4 h-56 w-56 animate-drift rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute bottom-0 right-2 h-48 w-48 animate-drift-alt rounded-full bg-yes/20 blur-3xl" />
        <div className="absolute right-16 top-0 h-28 w-28 animate-drift rounded-full bg-sun/40 blur-2xl" />
      </div>

      <div className="rounded-3xl border border-white/70 bg-surface/80 p-6 shadow-lift backdrop-blur-xl sm:p-7">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-yes">
            <LiveDot />
            Live tally
          </p>
          {pool.length > 1 && (
            <div className="flex gap-1.5" aria-hidden="true">
              {pool.map((p, n) => (
                <span
                  key={p.id}
                  className={`h-1.5 rounded-full transition-all duration-500 ${n === i % pool.length ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'}`}
                />
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-3 w-full rounded-full" />
          </div>
        ) : !s ? (
          <p className="mt-6 text-sm text-muted">No startups are in voting right now. New listings appear here first.</p>
        ) : (
          <Link key={s.id} href={`/startup/${s.slug}`} className="group mt-5 block animate-fade-up">
            <div className="flex items-center gap-3">
              <Logo name={s.name} src={s.logo_url} size={40} />
              <p className="min-w-0 truncate font-display text-xl font-semibold tracking-tight transition-colors group-hover:text-accent">
                {s.name}
              </p>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div>
                <p className="text-[13px] font-medium text-muted">Yes</p>
                <CountUp value={yes} format={formatVoteCount} className="font-display text-[34px] font-semibold leading-none text-yes" />
              </div>
              <p className="num pb-1 text-[13px] font-medium text-muted">{yesPct}% yes</p>
              <div className="text-right">
                <p className="text-[13px] font-medium text-muted">No</p>
                <CountUp value={no} format={formatVoteCount} className="font-display text-[34px] font-semibold leading-none text-no" />
              </div>
            </div>
            <SplitBar yes={yes} no={no} className="mt-4 h-3" />
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[13px]">
              <span className="text-muted">Toward the raise threshold</span>
              <span className="num font-semibold text-ink">{Math.round(s.progress ?? 0)}%</span>
            </div>
            <Progress value={s.progress ?? 0} tone="accent" className="mt-2" />
          </Link>
        )}
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
    <div className="mx-auto w-full max-w-page px-4 pb-24 pt-10 sm:px-6 sm:pt-20">
      <header className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <div className="stagger">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-sun ring-4 ring-sun/30" />
            100 free votes every day
          </p>
          <h1 className="mt-5 text-[40px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[56px] lg:text-[64px]">
            The crowd decides which startups get funded.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
            Vote yes on startups you believe in and no on the ones you don&apos;t. When a startup
            reaches its net vote threshold, it opens a USDC raise.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#startups" className={buttonClass('primary', 'lg')}>
              Start voting
            </a>
            <Link href="/how-it-works" className={buttonClass('secondary', 'lg')}>
              How it works
            </Link>
          </div>
        </div>
        <LiveTally startups={startups ?? []} loading={loading} />
      </header>

      <h2 id="startups" className="mt-24 scroll-mt-24 text-[26px] font-semibold sm:text-[30px]">Browse startups</h2>
      <div className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3">
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
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {[...Array(6)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filteredStartups.length === 0 ? (
        <EmptyState title={emptyCopy[tab].title} description={emptyCopy[tab].body} />
      ) : (
        <div key={tab} className="stagger divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {filteredStartups.map((startup) => (
            <StartupRow key={startup.id} startup={startup} />
          ))}
        </div>
      )}
    </div>
  )
}
