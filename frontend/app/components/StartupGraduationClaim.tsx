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
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="h-20 animate-pulse rounded-lg bg-[#E5E7EB]" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <p className="text-sm text-[#EF4444]">{error}</p>
      </div>
    )
  }
  if (!holding) return null

  return (
    <GraduationClaimCard
      holding={holding}
      userHasEmbeddedWallet={!!dbUser?.custodial_wallet_address}
      onClaim={fetchHolding}
    />
  )
}
