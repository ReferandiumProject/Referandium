'use client'

import { useEffect, useMemo, useState } from 'react'
import { EmptyState, Logo, Notice, Progress, Segmented, Skeleton } from '../components/ui'
import Link from 'next/link'
import { formatUsd, formatVoteCount } from '@/lib/format'

type TabKey = 'voting' | 'raising' | 'completed'
type WindowKey = '24h' | '7d' | 'all'

type LeaderboardItem = {
  startup_id: string
  slug: string
  name: string
  score: number
  weighted: number
  participants: number
  events: number
}

type ClosestToCrossingItem = {
  id: string
  slug: string
  name: string
  net: number
  threshold: number
  progress: number
}

type GraduatedItem = {
  startup_id: string
  slug: string
  name: string
  graduated_at: string
  amount_raised: string
}

type LeaderboardData = {
  phase: number
  window?: WindowKey
  leaderboard: (LeaderboardItem | GraduatedItem)[]
  closestToCrossing?: ClosestToCrossingItem[]
}

const TABS: { key: TabKey; label: string; phase: number }[] = [
  { key: 'voting', label: 'Voting', phase: 1 },
  { key: 'raising', label: 'Raising', phase: 2 },
  { key: 'completed', label: 'Completed', phase: 3 },
]

function formatScore(phase: number, score: number): string {
  if (phase === 2) {
    return formatUsd(score, 2)
  }
  return formatVoteCount(Math.round(score))
}

function formatGraduatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: 'all', label: 'All time' },
]

const windowHeading: Record<WindowKey, string> = {
  '24h': 'Most active in the last 24 hours',
  '7d': 'Most active in the last 7 days',
  all: 'Ranked by total support',
}

const emptyCopy: Record<TabKey, { title: string; body: string }> = {
  voting: {
    title: 'No activity yet',
    body: 'Startups will appear here once they receive votes.',
  },
  raising: {
    title: 'No activity yet',
    body: 'Startups will appear here once they start raising.',
  },
  completed: {
    title: 'No graduations yet',
    body: 'Graduations will appear here once a startup issues its token on chain.',
  },
}

const tabDescription: Record<TabKey, string> = {
  voting: 'Voting leaderboard',
  raising: 'Raising leaderboard',
  completed:
    'Completed token migrations, most recent first. No performance ranking is shown.',
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<TabKey>('voting')
  const [window, setWindow] = useState<WindowKey>('24h')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const phase = useMemo(
    () => TABS.find((t) => t.key === tab)?.phase ?? 1,
    [tab]
  )

  // The highlighted window is the one the server actually returned — when a
  // narrow window is empty the API falls through to a wider one and reports
  // it, so the selector always reflects what is on screen.
  const activeWindow: WindowKey = data?.window ?? window

  useEffect(() => {
    let cancelled = false

    async function fetchLeaderboard() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(
          `/api/leaderboard?phase=${phase}&window=${window}`
        )
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error || `Failed to load leaderboard (${res.status})`)
        }
        if (!cancelled) {
          setData(json as LeaderboardData)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load leaderboard')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchLeaderboard()

    return () => {
      cancelled = true
    }
  }, [phase, window])

  return (
    <div className="mx-auto w-full max-w-page px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">Leaderboard</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {phase === 3 ? tabDescription[tab] : `${windowHeading[activeWindow]}.`}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<TabKey>
          value={tab}
          onChange={setTab}
          options={TABS.map(({ key, label }) => ({ key, label }))}
        />
        {phase !== 3 && (
          <Segmented<WindowKey>
            size="sm"
            value={activeWindow}
            onChange={setWindow}
            options={WINDOWS.map(({ key, label }) => ({ key, label }))}
          />
        )}
      </div>

      {error && (
        <Notice tone="no" className="mb-4">
          {error}
        </Notice>
      )}

      {loading ? (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      ) : data?.leaderboard.length === 0 ? (
        <EmptyState title={emptyCopy[tab].title} description={emptyCopy[tab].body} />
      ) : phase === 3 ? (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {data?.leaderboard.map((item) => {
            const g = item as GraduatedItem
            return (
              <Link
                key={g.startup_id}
                href={`/startup/${g.slug}`}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-canvas sm:px-5"
              >
                <Logo name={g.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="text-[13px] text-muted">Graduated {formatGraduatedAt(g.graduated_at)}</p>
                </div>
                <div className="text-right">
                  <p className="num text-[15px] font-semibold text-yes">{formatUsd(g.amount_raised)}</p>
                  <p className="text-xs text-muted">raised</p>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {data?.leaderboard.map((item, index) => {
            const row = item as LeaderboardItem
            return (
              <Link
                key={row.startup_id}
                href={`/startup/${row.slug}`}
                className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-canvas sm:gap-4 sm:px-5"
              >
                <span
                  className={`num w-6 shrink-0 text-right text-sm font-semibold ${index < 3 ? 'text-ink' : 'text-faint'}`}
                >
                  {index + 1}
                </span>
                <Logo name={row.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.name}</p>
                  {activeWindow !== 'all' && (
                    <p className="num text-[13px] text-muted">{formatVoteCount(row.events)} events</p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`num text-[15px] font-semibold ${phase === 1 ? 'text-ink' : 'text-accent'}`}>
                    {formatScore(phase, row.score)}
                  </p>
                  <p className="num text-xs text-muted">
                    {activeWindow === 'all'
                      ? phase === 1
                        ? 'net votes'
                        : 'total raised'
                      : `${formatVoteCount(row.participants)} participants`}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {!loading && data?.closestToCrossing && data.closestToCrossing.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[15px] font-semibold">Closest to the raise threshold</h2>
          <p className="mt-0.5 text-[13px] text-muted">Shown for context. Not part of the ranking.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.closestToCrossing.map((s) => (
              <Link
                key={s.id}
                href={`/startup/${s.slug}`}
                className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <p className="truncate font-medium">{s.name}</p>
                <div className="num mb-2 mt-3 flex items-baseline justify-between text-[13px] text-muted">
                  <span>
                    {formatVoteCount(s.net)} / {formatVoteCount(s.threshold)} net
                  </span>
                  <span className="font-semibold text-ink">{Math.round(s.progress * 100)}%</span>
                </div>
                <Progress value={s.progress * 100} tone="neutral" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
