'use client'

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '@/app/context/UserContext'
import { GraduationClaimCard, type GraduationHolding } from './GraduationClaimCard'

export function StartupGraduationClaim({
  startupId,
  graduated,
}: {
  startupId: string | undefined
  graduated: boolean
}) {
  const { authenticated, getAccessToken } = usePrivy()
  const { dbUser } = useUser()
  const [holding, setHolding] = useState<GraduationHolding | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchHolding() {
    if (!authenticated || !startupId) return
    const token = await getAccessToken()
    if (!token) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/graduation-holders/mine?startup_id=${startupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load claim')
      }
      const list: GraduationHolding[] = json.holdings || []
      setHolding(list[0] ?? null)
    } catch (err: any) {
      setError(err.message || 'Failed to load claim')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (graduated) {
      fetchHolding()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, startupId, graduated])

  if (!graduated || !authenticated) return null
  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-20 animate-pulse rounded-lg bg-subtle" />
      </div>
    )
  }
  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-no/20 bg-no-soft px-4 py-3 text-sm text-no">
        {error}
      </p>
    )
  }
  if (!holding) return null

  return (
    <GraduationClaimCard
      holding={holding}
      userHasEmbeddedWallet={!!dbUser?.custodial_wallet_address}
      getAccessToken={getAccessToken}
      onClaim={fetchHolding}
    />
  )
}
