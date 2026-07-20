'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Navbar from '../components/Navbar'

type Market = {
  id: string
  title: string
  status: string
  category: string
  end_date: string
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

  const resolve = async (marketId: string, outcome: 'YES' | 'NO') => {
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
      body: JSON.stringify({ outcome }),
    })

    const json = await res.json().catch(() => ({}))
    setResponses((r) => ({
      ...r,
      [marketId]: `${outcome}: ${JSON.stringify(json, null, 2)}`,
    }))

    if (res.ok) {
      await fetchMarkets(token)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#F9FAFB] px-4 pb-24 pt-8 text-gray-900"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <main className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-semibold text-[#3B82F6] sm:text-3xl">
          Admin - Markets
        </h1>

        {loading && (
          <p className="text-sm text-gray-500">Loading markets...</p>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && markets && markets.length === 0 && (
          <p className="text-sm text-gray-500">No markets found.</p>
        )}

        {!loading && !error && markets && markets.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {markets.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <h2 className="text-base font-medium leading-snug text-gray-900 sm:text-lg">
                    {m.title}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      m.status === 'active'
                        ? 'bg-[#3B82F6]/10 text-[#3B82F6]'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3 text-sm text-gray-500">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      Category
                    </p>
                    <p className="text-gray-900">{m.category}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      End Date
                    </p>
                    <p className="text-gray-900">
                      {new Date(m.end_date).toLocaleString()}
                    </p>
                  </div>
                </div>

                {m.status === 'active' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => resolve(m.id, 'YES')}
                      className="rounded-lg bg-[#3B82F6] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      Resolve YES
                    </button>
                    <button
                      onClick={() => resolve(m.id, 'NO')}
                      className="rounded-lg bg-[#3B82F6] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      Resolve NO
                    </button>
                  </div>
                )}

                {responses[m.id] && (
                  <pre className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
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
