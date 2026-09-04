'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatUsd, formatVoteCount } from '@/lib/format'

type TabKey = 'voting' | 'raising' | 'completed'

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

type LeaderboardData = {
  phase: number
  leaderboard: LeaderboardItem[]
  closestToCrossing?: ClosestToCrossingItem[]
}

const TABS: { key: TabKey; label: string; phase: number }[] = [
  { key: 'voting', label: 'Voting', phase: 1 },
  { key: 'raising', label: 'Raising', phase: 2 },
  { key: 'completed', label: 'Completed', phase: 3 },
]

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatScore(phase: number, score: number): string {
  if (phase === 2) {
    return formatUsd(score, 2)
  }
  return formatVoteCount(Math.round(score))
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<TabKey>('voting')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const phase = useMemo(
    () => TABS.find((t) => t.key === tab)?.phase ?? 1,
    [tab]
  )

  useEffect(() => {
    let cancelled = false

    async function fetchLeaderboard() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/leaderboard?phase=${phase}`)
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
  }, [phase])

  return (
    <div className="min-h-screen bg-[#F9FAFB] px-4 py-10 text-[#111827] sm:py-14">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 text-center sm:mb-14">
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl md:text-5xl">
            Leaderboard
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#6B7280] sm:text-lg">
            Startups ranked by what is moving right now. Votes, capital, and
            graduation are scored separately — they do not share a ranking.
          </p>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-[#EF4444]">{error}</p>
          </div>
        )}

        <div className="mb-8 flex flex-wrap gap-2 sm:mb-10">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === key
                  ? 'bg-[#3B82F6] text-white'
                  : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-16 w-full animate-pulse rounded-xl bg-[#E5E7EB]"
              />
            ))}
          </div>
        ) : data?.leaderboard.length === 0 ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white py-16 text-center shadow-sm">
            <p className="text-lg font-medium text-[#111827]">
              Nothing has moved in the last three days
            </p>
            <p className="mt-2 text-sm text-[#6B7280]">
              Check back when the market gets going.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.leaderboard.map((item, index) => (
              <Link
                key={item.startup_id}
                href={`/startup/${item.slug}`}
                className="group flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm transition-colors duration-200 hover:border-[#3B82F6]/50"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-sm font-bold text-[#6B7280]">
                    {index + 1}
                  </span>
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#3B82F6] text-sm font-bold text-white">
                    {getInitials(item.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-[#111827]">{item.name}</p>
                    <p className="text-xs text-[#6B7280]">
                      {formatVoteCount(item.events)} events
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-[#3B82F6]">
                    {formatScore(phase, item.score)}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {formatVoteCount(item.participants)} participants
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && data?.closestToCrossing && data.closestToCrossing.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-lg font-semibold text-[#111827]">
              Closest to crossing
            </h2>
            <p className="mb-4 text-sm text-[#6B7280]">
              Status panel, not part of the ranking.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.closestToCrossing.map((s) => (
                <Link
                  key={s.id}
                  href={`/startup/${s.slug}`}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm transition-colors hover:border-[#3B82F6]/50"
                >
                  <p className="font-semibold text-[#111827]">{s.name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-[#6B7280]">
                    <span>{formatVoteCount(s.net)} / {formatVoteCount(s.threshold)} votes</span>
                    <span>{Math.round(s.progress * 100)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                    <div
                      className="h-full bg-[#3B82F6]"
                      style={{ width: `${Math.min(100, s.progress * 100)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
