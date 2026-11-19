'use client'

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatUsd } from '@/lib/format'
import { Notice, buttonClass } from '../components/ui'
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
      <div className="mx-auto w-full max-w-xl px-4 py-24 sm:px-6">
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.03em] sm:text-[44px]">Buy credits and USDC</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Sign in to buy listing credits or add USDC to your balance.
        </p>
        <button onClick={() => login()} className={buttonClass('primary', 'lg', 'mt-8')}>
          Sign in to continue
        </button>
      </div>
    )
  }

  const packButton = (id: string) => (
    <span className={buttonClass('primary', 'md', 'mt-5 w-full')}>{buying === id ? 'Redirecting…' : 'Buy with card'}</span>
  )

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.03em] sm:text-[44px]">Buy credits and USDC</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Listing credits let you put startups up for a vote. USDC is the balance you use to back
          startups that are raising.
        </p>
      </header>

      <dl className="mt-8 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface">
        {[
          { label: 'Available USDC', value: formatUsd(balance?.available_usdc) },
          { label: 'Locked USDC', value: formatUsd(balance?.locked_usdc) },
          { label: 'Listing credits', value: listingCredits?.credits ?? '—' },
        ].map((st) => (
          <div key={st.label} className="min-w-0 px-4 py-4 sm:px-5">
            <dt className="truncate text-[13px] text-muted">{st.label}</dt>
            <dd className="num mt-1 truncate text-lg font-semibold sm:text-xl">{loading ? '…' : st.value}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <Notice tone="no" className="mt-4">
          {error}
        </Notice>
      )}
      {releasedNotice && (
        <Notice tone="yes" className="mt-4">
          Your funds have arrived: {formatUsd(releasedNotice.usdc)} from {releasedNotice.count} released investment pack{releasedNotice.count === 1 ? '' : 's'}.
        </Notice>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Listing credits</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
          One credit lists one startup. Credits never expire. They can&apos;t be withdrawn or turned
          into USDC.
        </p>

        <div className="stagger mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LISTING_PACKAGES.map((pack) => (
            <button
              key={pack.id}
              onClick={() => handleBuy(pack.id)}
              disabled={buying === pack.id}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lift disabled:cursor-wait disabled:opacity-60"
            >
              <span className="text-sm font-medium text-muted">{pack.label}</span>
              <span className="num mt-2 font-display text-[32px] font-bold leading-none tracking-tight">{formatPrice(pack.amount)}</span>
              <span className="num mt-2 text-sm text-ink-soft">
                {pack.credits === 1 ? '1 credit' : `${pack.credits} credits`}
              </span>
              {packButton(pack.id)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Add USDC</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
          Card fees, including a fixed per-payment charge, come out of the amount you choose. The rest
          is added to your balance once the payment settles, so larger amounts lose less to fees.
        </p>
        <Notice tone="warn" className="mt-4">
          Funds stay locked until Stripe reports the payment as settled. This is the time it takes to
          convert card money, not an arbitrary hold.
        </Notice>

        <div className="stagger mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {INVESTMENT_PACKAGES.map((pack) => (
            <button
              key={pack.id}
              onClick={() => handleBuy(pack.id)}
              disabled={buying === pack.id}
              className="flex flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lift disabled:cursor-wait disabled:opacity-60"
            >
              <span className="text-sm font-medium text-muted">Add to balance</span>
              <span className="num mt-2 font-display text-[32px] font-bold leading-none tracking-tight">{formatPrice(pack.amount)}</span>
              <span className="mt-2 text-sm text-ink-soft">Minus card fees</span>
              {packButton(pack.id)}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
