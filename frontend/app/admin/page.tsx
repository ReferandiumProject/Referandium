'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Navbar from '../components/Navbar'

type MarketOption = {
  id: string
  label: string
}

type Market = {
  id: string
  title: string
  status: string
  category: string
  end_date: string
  market_options?: MarketOption[] | null
}

export default function AdminPage() {
  const { getAccessToken, authenticated } = usePrivy()
  const [markets, setMarkets] = useState<Market[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, string>>({})

  const fetchMarkets = useCallback(async (tokenOverride?: string) => {
    setLoading(true)
    setError(null)

    const token = tokenOverride || (await getAccessToken())
    if (!token) {
      setError('Not authorized')
      setLoading(false)
      return
    }

    const res = await fetch('/api/admin/markets', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (res.status === 401 || res.status === 403) {
      setError('Not authorized')
      setLoading(false)
      return
    }

    if (!res.ok) {
      setError('Failed to load markets')
      setLoading(false)
      return
    }

    const json = await res.json()
    setMarkets(json.markets || [])
    setLoading(false)
  }, [getAccessToken])

  useEffect(() => {
    if (!authenticated) {
      setMarkets(null)
      setError('Not authenticated')
      setLoading(false)
      return
    }
    fetchMarkets()
  }, [authenticated, fetchMarkets])

  const resolve = async (marketId: string, optionId: string, label: string) => {
    const token = await getAccessToken()
    if (!token) {
      setResponses((r) => ({ ...r, [marketId]: 'Not authorized' }))
      return
    }

    const res = await fetch(`/api/markets/${marketId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ winning_option_id: optionId }),
    })

    const json = await res.json().catch(() => ({}))
    setResponses((r) => ({
      ...r,
      [marketId]: `${label}: ${JSON.stringify(json, null, 2)}`,
    }))

    if (res.ok) {
      await fetchMarkets(token)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#F9FAFB] px-4 pb-24 pt-8 text-[#111827]"
    >
      <main className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-2xl font-bold text-[#111827] sm:text-3xl">
          Admin - Markets
        </h1>

        {loading && (
          <p className="text-sm text-[#6B7280]">Loading markets...</p>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#EF4444]">
            {error}
          </div>
        )}

        {!loading && !error && markets && markets.length === 0 && (
          <p className="text-sm text-[#6B7280]">No markets found.</p>
        )}

        {!loading && !error && markets && markets.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {markets.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-6"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <h2 className="text-[15px] font-semibold leading-snug text-[#111827]">
                    {m.title}
                  </h2>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                      m.status === 'active'
                        ? 'bg-[#3B82F6]/10 text-[#3B82F6]'
                        : 'bg-[#F3F4F6] text-[#6B7280]'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3 text-sm text-[#6B7280]">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#6B7280]">
                      Category
                    </p>
                    <p className="text-[#111827]">{m.category}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#6B7280]">
                      End Date
                    </p>
                    <p className="text-[#111827]">
                      {new Date(m.end_date).toLocaleString()}
                    </p>
                  </div>
                </div>

                {m.status === 'active' && (m.market_options?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.market_options!.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => resolve(m.id, option.id, option.label)}
                        className="rounded-lg bg-[#3B82F6] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
                      >
                        Resolve {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {responses[m.id] && (
                  <pre className="mt-4 overflow-x-auto rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#111827] whitespace-pre-wrap">
                    {responses[m.id]}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
