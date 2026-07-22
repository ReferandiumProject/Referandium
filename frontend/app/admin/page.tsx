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

type Gookie = {
  id: string
  user_id: string
  status: string
  invited_by: string
  user_email?: string | null
  invited_by_email?: string | null
}

export default function AdminPage() {
  const { getAccessToken, authenticated } = usePrivy()
  const [markets, setMarkets] = useState<Market[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [gookies, setGookies] = useState<Gookie[]>([])
  const [gookieEmail, setGookieEmail] = useState('')
  const [gookieMessage, setGookieMessage] = useState<string | null>(null)

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

  const fetchGookies = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride || (await getAccessToken())
    if (!token) return
    const res = await fetch('/api/admin/gookies', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (res.ok) {
      const json = await res.json()
      setGookies(json.gookies || [])
    }
  }, [getAccessToken])

  useEffect(() => {
    if (!authenticated) {
      setGookies([])
      return
    }
    fetchGookies()
  }, [authenticated, fetchGookies])

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

  const inviteGookie = async (e: React.FormEvent) => {
    e.preventDefault()
    setGookieMessage(null)
    const token = await getAccessToken()
    if (!token) {
      setGookieMessage('Not authorized')
      return
    }
    const res = await fetch('/api/admin/gookies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: gookieEmail }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setGookieEmail('')
      setGookieMessage('Gookie invited')
      await fetchGookies(token)
    } else {
      setGookieMessage(json.error || 'Failed to invite gookie')
    }
  }

  const revokeGookie = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    const res = await fetch(`/api/admin/gookies/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: 'revoked' }),
    })
    if (res.ok) {
      await fetchGookies(token)
    } else {
      setGookieMessage('Failed to revoke gookie')
    }
  }

  const reviewMarket = async (marketId: string, status: 'active' | 'cancelled') => {
    const token = await getAccessToken()
    if (!token) return
    const res = await fetch(`/api/admin/markets/${marketId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      await fetchMarkets(token)
    } else {
      setError('Failed to update market status')
    }
  }

  const activeMarkets = (markets || []).filter((m) => m.status === 'active')
  const pendingMarkets = (markets || []).filter((m) => m.status === 'pending')

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

        {!loading && !error && activeMarkets.length === 0 && (
          <p className="text-sm text-[#6B7280]">No active markets.</p>
        )}

        {!loading && !error && activeMarkets.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {activeMarkets.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-6"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <h2 className="text-[15px] font-semibold leading-snug text-[#111827]">
                    {m.title}
                  </h2>
                  <span className="shrink-0 rounded bg-[#3B82F6]/10 px-2 py-0.5 text-xs font-semibold text-[#3B82F6]">
                    active
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

                {(m.market_options?.length ?? 0) > 0 && (
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

        {!loading && !error && pendingMarkets.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-6 text-xl font-bold text-[#111827]">Pending Markets</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {pendingMarkets.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-6"
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <h2 className="text-[15px] font-semibold leading-snug text-[#111827]">
                      {m.title}
                    </h2>
                    <span className="shrink-0 rounded bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#D97706]">
                      pending
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

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => reviewMarket(m.id, 'active')}
                      className="rounded-lg bg-[#10B981] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reviewMarket(m.id, 'cancelled')}
                      className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm font-semibold text-[#EF4444] transition-colors hover:bg-[#FECACA]"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <h2 className="mb-6 text-xl font-bold text-[#111827]">Gookies</h2>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
            <form onSubmit={inviteGookie} className="mb-6">
              <label className="mb-2 block text-sm font-medium text-[#111827]">
                Invite by email
              </label>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={gookieEmail}
                  onChange={(e) => setGookieEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="flex-1 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
                >
                  Invite
                </button>
              </div>
            </form>
            {gookieMessage && (
              <p className="mb-4 text-sm text-[#6B7280]">{gookieMessage}</p>
            )}
            {gookies.length === 0 ? (
              <p className="text-sm text-[#6B7280]">No gookies yet.</p>
            ) : (
              <div className="space-y-3">
                {gookies.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#111827]">
                        {g.user_email || g.user_id}
                      </p>
                      <p className="text-xs text-[#6B7280]">
                        Status:{' '}
                        <span
                          className={`font-semibold ${
                            g.status === 'active'
                              ? 'text-[#10B981]'
                              : 'text-[#6B7280]'
                          }`}
                        >
                          {g.status}
                        </span>{' '}
                        · Invited by {g.invited_by_email || g.invited_by}
                      </p>
                    </div>
                    {g.status === 'active' && (
                      <button
                        onClick={() => revokeGookie(g.id)}
                        className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-1.5 text-sm font-semibold text-[#EF4444] transition-colors hover:bg-[#FECACA]"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
