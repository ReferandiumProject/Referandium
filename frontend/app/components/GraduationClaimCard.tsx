'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatTokenAmount } from '@/lib/format'

export type GraduationHolding = {
  id: string
  startup_id: string
  startup_name: string
  startup_slug: string
  startup_logo_url: string | null
  token_name: string
  token_symbol: string
  mint_address: string | null
  escrow_address: string | null
  wallet_address: string | null
  tokens_onchain: string
  status: string
  signature: string | null
  error: string | null
  claimed_at: string | null
}

function shortAddress(addr: string | null | undefined): string {
  if (!addr) return '—'
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`
}

function explorerLink(signature: string): string {
  const base = 'https://explorer.solana.com/tx'
  return `${base}/${signature}?cluster=devnet`
}

export function GraduationClaimCard({
  holding,
  userHasEmbeddedWallet,
  onClaim,
  showStartupLink = false,
}: {
  holding: GraduationHolding
  userHasEmbeddedWallet: boolean
  onClaim?: () => Promise<void>
  showStartupLink?: boolean
}) {
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const amount = formatTokenAmount(holding.tokens_onchain)
  const tokenLabel = holding.token_symbol || holding.token_name || 'tokens'

  const handleClaim = async () => {
    setSubmitting(true)
    setLocalError(null)
    try {
      const res = await fetch(`/api/graduation-holders/${holding.id}/claim`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Claim failed')
      }
      await onClaim?.()
    } catch (err: any) {
      setLocalError(err.message || 'Claim failed')
    } finally {
      setSubmitting(false)
    }
  }

  const cardClass =
    'w-full min-w-0 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm'

  const startupLink = showStartupLink && holding.startup_slug && (
    <div className="mb-2">
      <Link
        href={`/startup/${holding.startup_slug}`}
        className="text-sm font-semibold text-[#3B82F6] hover:underline"
      >
        {holding.startup_name} →
      </Link>
    </div>
  )

  if (holding.status === 'claimed') {
    return (
      <div className={cardClass}>
        {startupLink}
        <p className="mb-1 text-sm text-[#6B7280]">Your tokens</p>
        <p className="text-2xl font-semibold text-[#111827]">
          {amount} {tokenLabel}
        </p>
        <p className="mt-2 text-sm text-[#10B981]">
          Claim completed — sent to {shortAddress(holding.wallet_address)}
        </p>
        {holding.signature && (
          <a
            href={explorerLink(holding.signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#3B82F6] hover:underline"
          >
            View transaction
          </a>
        )}
      </div>
    )
  }

  const dustAmount = formatTokenAmount(holding.tokens_onchain, 18)

  if (holding.status === 'dust_zero') {
    return (
      <div className={cardClass}>
        {startupLink}
        <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-sm text-[#B45309]">
          <p className="">
            This share was below the smallest amount that can exist on-chain, so it could not be
            sent as a token. It went into the startup&apos;s liquidity pool instead.
          </p>
          <p className="mt-1.5 font-medium">
            You did nothing wrong, and your other tokens are unaffected.
          </p>
        </div>
        <p className="mt-4 text-sm text-[#6B7280]">
          Your share:{' '}
          <span className="font-semibold text-[#111827]">
            {dustAmount} {tokenLabel}
          </span>
        </p>
      </div>
    )
  }

  if (holding.status === 'claiming') {
    return (
      <div className={cardClass}>
        {startupLink}
        <p className="mb-1 text-sm text-[#6B7280]">Your tokens</p>
        <p className="text-2xl font-semibold text-[#111827]">
          {amount} {tokenLabel}
        </p>
        <p className="mt-3 text-sm text-[#3B82F6]">
          Claim submitted. The platform is covering the transaction fee and the token account rent.
          You do not need to do anything else.
        </p>
      </div>
    )
  }

  if (holding.status === 'failed') {
    return (
      <div className={cardClass}>
        {startupLink}
        <p className="mb-1 text-sm text-[#6B7280]">Your tokens</p>
        <p className="text-2xl font-semibold text-[#111827]">
          {amount} {tokenLabel}
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-[#111827]">
            You still own these tokens — they are held in escrow and nothing has been lost. The
            transfer did not go through and we will try again automatically. No action is needed from
            you.
          </p>
          {holding.error && (
            <p className="text-[#6B7280]">
              Reason: {holding.error}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (holding.status === 'claimable' && !holding.wallet_address && !userHasEmbeddedWallet) {
    return (
      <div className={cardClass}>
        {startupLink}
        <p className="mb-1 text-sm text-[#6B7280]">Your tokens</p>
        <p className="text-2xl font-semibold text-[#111827]">
          {amount} {tokenLabel}
        </p>
        <div className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-sm text-[#B45309]">
          <p className="">⚠️ You are still owed these tokens.</p>
          <p className="mt-1.5 ">
            A wallet will be created for you the next time you sign in, and they will be sent there
            automatically. You do not need to pay a fee or approve anything.
          </p>
        </div>
      </div>
    )
  }

  // claimable with a wallet address, or claimable with no wallet address but the user has an
  // embedded wallet the backend can use.
  return (
    <div className={cardClass}>
      {startupLink}
      <p className="mb-1 text-sm text-[#6B7280]">Your tokens</p>
      <p className="text-2xl font-semibold text-[#111827]">
        {amount} {tokenLabel}
      </p>
      <p className="mt-1 text-xs text-[#6B7280]">
        Destination: {shortAddress(holding.wallet_address)}
      </p>
      {localError && (
        <p className="mt-3 text-sm text-[#EF4444]">{localError}</p>
      )}
      <button
        onClick={handleClaim}
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Claiming…' : 'Claim tokens'}
      </button>
      <p className="mt-2 text-center text-xs text-[#6B7280]">
        The platform pays the fee; nothing is deducted from your share.
      </p>
    </div>
  )
}
