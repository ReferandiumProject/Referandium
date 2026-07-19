'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!authenticated) {
      setMarkets(null)
      setError('Not authenticated')
      return
    }

    async function load() {
      setLoading(true)
      setError(null)

      const token = await getAccessToken()
      if (!token) {
        setError('Not authorized')
        setLoading(false)
        return
      }

      const res = await fetch('/api/admin/markets', {
        headers: { Authorization: `Bearer ${token}` },
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
    }

    load()
  }, [authenticated, getAccessToken])

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
  }

  return (
    <div>
      <main style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
        <h1>Admin - Markets</h1>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && !error && markets && (
          <table
            border={1}
            cellPadding={6}
            style={{ borderCollapse: 'collapse', marginTop: '1rem' }}
          >
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Category</th>
                <th>End Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id}>
                  <td>{m.title}</td>
                  <td>{m.status}</td>
                  <td>{m.category}</td>
                  <td>{new Date(m.end_date).toLocaleString()}</td>
                  <td>
                    {m.status === 'active' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => resolve(m.id, 'YES')}>
                          Resolve YES
                        </button>
                        <button onClick={() => resolve(m.id, 'NO')}>
                          Resolve NO
                        </button>
                      </div>
                    )}
                    {responses[m.id] && (
                      <pre style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                        {responses[m.id]}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  )
}
