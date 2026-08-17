'use client'

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatUsd } from '@/lib/format'
import { PURCHASE_PACKAGES } from '@/lib/purchase-packages'

type ListingCredits = { credits: number }
type Balance = {
  available_usdc: number
  locked_usdc: number
  released?: { count: number; usdc: number }
}

const LISTING_PACKAGES = PURCHASE_PACKAGES.filter((p) => p.product === 'listing_pack')
const INVESTMENT_PACKAGES = PURCHASE_PACKAGES.filter((p) => p.product === 'investment_pack')

function formatPrice(cents: number) {
  return formatUsd(cents / 100)
}

export default function BuyPage() {
  const { authenticated, getAccessToken, login } = usePrivy()

  const [balance, setBalance] = useState<Balance | null>(null)
  const [listingCredits, setListingCredits] = useState<ListingCredits | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [releasedNotice, setReleasedNotice] = useState<{ count: number; usdc: number } | null>(null)

  const fetchState = async () => {
    const token = await getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setReleasedNotice(null)

    try {
      const [balanceRes, creditsRes] = await Promise.all([
        fetch('/api/balance', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/listing-credits', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const balanceJson = await balanceRes.json().catch(() => ({}))
      const creditsJson = await creditsRes.json().catch(() => ({}))

      if (balanceRes.ok && balanceJson.data) {
        setBalance(balanceJson.data)
        const released = balanceJson.data.released
        if (released && (released.count > 0 || released.usdc > 0)) {
          setReleasedNotice(released)
        }
      } else {
        setError(balanceJson.error || 'Failed to load balance')
      }

      if (creditsRes.ok && typeof creditsJson.credits === 'number') {
        setListingCredits({ credits: creditsJson.credits })
      } else if (!creditsRes.ok) {
        setError(creditsJson.error || 'Failed to load listing credits')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load account state')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) {
      fetchState()
    } else {
      setLoading(false)
    }
  }, [authenticated, getAccessToken])

  const handleBuy = async (packageId: string) => {
    setError(null)

    let token: string | null = null
    try {
      token = await getAccessToken()
    } catch (err: any) {
      console.error('[buy] getAccessToken failed:', err)
      setError('Failed to get access token. Please sign in again.')
      return
    }

    if (!token) {
      login()
      return
    }

    setBuying(packageId)
    let responseStatus = 0
    let responseBody: any = null

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ package_id: packageId }),
      })

      responseStatus = res.status
      const responseText = await res.text()

      try {
        responseBody = responseText ? JSON.parse(responseText) : {}
      } catch {
        responseBody = { raw: responseText }
      }

      console.log('[buy] checkout response:', responseStatus, responseBody)

      if (!res.ok) {
        const message = responseBody?.error || `Checkout failed (status ${responseStatus})`
        setError(message)
        return
      }

      if (responseBody?.url) {
        window.location.href = responseBody.url
      } else {
        setError('No checkout URL returned. Please try again.')
      }
    } catch (err: any) {
      console.error('[buy] checkout fetch failed:', err)
      setError(err.message || 'Checkout failed')
    } finally {
      setBuying(null)
    }
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-3xl font-semibold text-[#111827]">Buy packs</h1>
          <p className="mb-6 text-sm text-[#6B7280]">
            Sign in to purchase listing credits and add funds to your balance.
          </p>
          <button
            onClick={() => login()}
            className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            Sign In
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F9FAFB] px-4 pb-24 pt-6 text-[#111827] sm:pt-8">
      <div className="mx-auto max-w-4xl">
        {loading && (
          <p className="mb-4 text-sm text-[#6B7280]">Loading account...</p>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
            {error}
          </div>
        )}
        {releasedNotice && (
          <div className="mb-4 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-3 text-sm text-[#10B981]">
            Your funds have arrived: {formatUsd(releasedNotice.usdc)} from {releasedNotice.count} released investment pack{releasedNotice.count === 1 ? '' : 's'}.
          </div>
        )}

        <div className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#111827]">Buy packs</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Purchase listing credits or add USDC to your balance for backing startups.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Available USDC</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(balance?.available_usdc)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Locked USDC</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{formatUsd(balance?.locked_usdc)}</p>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Listing credits</p>
              <p className="mt-1 text-lg font-semibold text-[#111827]">{listingCredits?.credits ?? '—'}</p>
            </div>
          </div>
        </div>

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#111827]">Listing packs</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Buy the right to list startups. Credits never expire and can be used whenever you need them.
          </p>
          <p className="mt-2 text-xs text-[#6B7280]">
            Listing credits are for listing startups only. They cannot be withdrawn or converted to your USDC balance.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {LISTING_PACKAGES.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleBuy(pack.id)}
                disabled={buying === pack.id}
                className="flex flex-col items-start rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-5 text-left transition-colors hover:border-[#3B82F6] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-base font-semibold text-[#111827]">{pack.label}</span>
                <span className="mt-1 text-2xl font-bold text-[#111827]">{formatPrice(pack.amount)}</span>
                <span className="mt-2 text-sm text-[#6B7280]">
                  {pack.credits === 1 ? '1 credit' : `${pack.credits} credits`}
                </span>
                {buying === pack.id ? (
                  <span className="mt-4 inline-flex items-center rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white">
                    Redirecting…
                  </span>
                ) : (
                  <span className="mt-4 inline-flex items-center rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">
                    Buy
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#111827]">Investment packs</h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Add USDC to the balance you use for backing startups. Choose the amount you want to add.
          </p>
          <div className="mt-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-sm text-[#B45309]">
            Funds are held until Stripe reports them as available. This is the settlement period
            — real money being converted before it becomes spendable, not an arbitrary delay.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {INVESTMENT_PACKAGES.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleBuy(pack.id)}
                disabled={buying === pack.id}
                className="flex flex-col items-start rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-5 text-left transition-colors hover:border-[#3B82F6] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-2xl font-bold text-[#111827]">{formatPrice(pack.amount)}</span>
                <span className="mt-2 text-sm text-[#6B7280]">
                  Card fees are deducted from this — whatever remains is added to your balance
                  once the payment settles.
                </span>
                {buying === pack.id ? (
                  <span className="mt-4 inline-flex items-center rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white">
                    Redirecting…
                  </span>
                ) : (
                  <span className="mt-4 inline-flex items-center rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">
                    Buy
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
