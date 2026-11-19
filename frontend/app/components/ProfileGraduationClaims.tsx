'use client'

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/app/context/UserContext'
import { GraduationClaimCard, type GraduationHolding } from './GraduationClaimCard'

export function useProfileClaims() {
  const { authenticated, getAccessToken } = usePrivy()
  const [holdings, setHoldings] = useState<GraduationHolding[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchHoldings() {
    if (!authenticated) return
    const token = await getAccessToken()
    if (!token) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/graduation-holders/mine', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load claims')
      }
      setHoldings((json.holdings as GraduationHolding[]) || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load claims')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHoldings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  return { holdings, loading, error, refresh: fetchHoldings }
}

export function ProfileGraduationClaims() {
  const { dbUser } = useUser()
  const { getAccessToken } = usePrivy()
  const { holdings, loading, error, refresh } = useProfileClaims()

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-subtle" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm text-no">{error}</p>
      </div>
    )
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <h3 className="text-lg font-semibold text-ink">No token claims</h3>
        <p className="mt-1 text-sm text-muted">
          When a startup you voted for completes its graduation, the tokens you are owed will appear
          here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {holdings.map((holding) => (
        <GraduationClaimCard
          key={holding.id}
          holding={holding}
          userHasEmbeddedWallet={!!dbUser?.custodial_wallet_address}
          getAccessToken={getAccessToken}
          onClaim={refresh}
          showStartupLink
        />
      ))}
    </div>
  )
}
