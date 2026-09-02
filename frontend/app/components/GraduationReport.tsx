'use client'

import { formatTokenAmount, formatUsd, formatUsdc, formatPrice } from '@/lib/format'

export type GraduationReport = {
  token_name: string | null
  token_symbol: string | null
  status: string
  mint_address: string | null
  total_supply: string
  tokens_to_holders: string
  tokens_to_lp: string
  dust_to_lp: string
  founder_usdc: string
  founder_payout_signature: string | null
  pool_address: string | null
  lp_burn_signature: string | null
  authority_revoke_signature: string | null
  liquidity_usdc: string
  lp_mint_address: string | null
  lp_token_account: string | null
  capital_target: string
  pool_usdc: string
  final_price: string
  total_holders: number
  claimed_count: number
  dust_count: number
}

function solanaAddressExplorerLink(address: string | null | undefined): string | null {
  return address ? `https://explorer.solana.com/address/${address}?cluster=devnet` : null
}

function solanaTxExplorerLink(signature: string | null | undefined): string | null {
  return signature ? `https://explorer.solana.com/tx/${signature}?cluster=devnet` : null
}

function holderDistributionMessage(total: number, claimed: number, dust: number): string {
  const unclaimed = total - claimed - dust
  const share = (n: number) => (n === 1 ? 'share' : 'shares')
  const haveHas = claimed === 1 ? 'has' : 'have'
  let s = `${claimed} of ${total} holder ${share(total)} ${haveHas} been claimed`
  if (dust > 0) {
    s += `. ${dust} ${share(dust)} below the smallest on-chain unit and became dust in the LP`
  }
  if (unclaimed > 0) {
    s += `. ${unclaimed} ${share(unclaimed)} still waiting in escrow to be claimed`
  }
  return s + '.'
}

function statusMessage(status: string): string {
  switch (status) {
    case 'complete':
      return 'The token has been minted, the liquidity pool created, the LP tokens burned, the mint authority revoked, and the founder has been paid.'
    case 'revoking':
      return 'Mint authority is being revoked. This is the final step before the graduation is complete.'
    case 'founder_paid':
      return 'Founder payout is complete. Revoking the mint authority is the final step.'
    case 'paying_founder':
      return 'Founder payout is being processed.'
    case 'burned':
      return 'The LP tokens have been burned. Founder payout is next.'
    case 'burning':
      return 'The LP tokens are being burned.'
    case 'pooled':
      return 'The liquidity pool has been created. The LP tokens will be burned next.'
    case 'pooling':
      return 'The liquidity pool is being created on Raydium.'
    case 'minted':
      return 'The token has been minted. The liquidity pool is being created next.'
    case 'minting':
      return 'The token is being minted.'
    case 'halted':
      return 'Graduation is paused. The team will resume the process.'
    default:
      return 'The token is being prepared for issuance.'
  }
}

function ExternalLink({
  href,
  children,
}: {
  href: string | null | undefined
  children: React.ReactNode
}) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[#3B82F6] hover:underline"
    >
      {children}
    </a>
  )
}

export function GraduationReport({
  report,
  startupName,
}: {
  report: GraduationReport
  startupName: string
}) {
  const tokenLabel = report.token_symbol || report.token_name || 'tokens'
  const progress =
    Number(report.capital_target) > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (Number(report.pool_usdc) / Number(report.capital_target)) * 100
          )
        )
      : 100

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-4 text-sm text-[#10B981]">
        <p className="font-semibold">
          {report.status === 'complete' ? 'Graduation complete' : 'Graduation in progress'}
        </p>
        <p className="mt-1">{statusMessage(report.status)}</p>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-semibold text-[#111827]">Raise outcome</h3>
        <p className="mb-4 text-sm text-[#6B7280]">
          {report.pool_address
            ? `${startupName} completed its capital raise and moved to a Raydium liquidity pool.`
            : 'The capital raise is complete. The Raydium liquidity pool will be created once this phase finishes.'}
        </p>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-xs text-[#6B7280]">
            <span className="font-semibold text-[#10B981]">
              {Math.round(progress)}% raised
            </span>
            <span>
              {formatUsd(report.pool_usdc, 6)} / {formatUsd(report.capital_target, 6)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full bg-[#10B981]"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-[#6B7280]">Final raise price</span>
          <span className="font-medium text-[#111827]">${formatPrice(report.final_price)}</span>
        </div>

        {report.pool_address && (
          <div className="mt-2 text-right text-xs text-[#6B7280]">
            Final bonding-curve price.{' '}
            <ExternalLink href={solanaAddressExplorerLink(report.pool_address)}>
              View Raydium pool
            </ExternalLink>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-semibold text-[#111827]">Token at a glance</h3>
        <p className="mb-4 text-sm text-[#6B7280]">
          {report.token_name || startupName}{' '}
          {report.token_symbol ? `(${report.token_symbol})` : ''}
        </p>

        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            Total supply
          </p>
          <p className="text-2xl font-semibold text-[#111827]">
            {formatTokenAmount(report.total_supply)} {tokenLabel}
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-[#F9FAFB] p-3">
            <span className="text-[#6B7280]">To holders</span>
            <span className="font-medium text-[#111827]">
              {formatTokenAmount(report.tokens_to_holders)} {tokenLabel}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#F9FAFB] p-3">
            <span className="text-[#6B7280]">Allocated to liquidity pool</span>
            <span className="font-medium text-[#111827]">
              {formatTokenAmount(report.tokens_to_lp)} {tokenLabel}
            </span>
          </div>
          {Number(report.dust_to_lp) > 0 && (
            <p className="text-xs text-[#9CA3AF]">
              * {formatTokenAmount(report.dust_to_lp, 6)} {tokenLabel} were below the smallest
              on-chain unit and were added to the LP as dust.
            </p>
          )}
        </div>

        {report.mint_address && (
          <div className="mt-4 text-sm">
            <span className="text-[#6B7280]">Mint: </span>
            <ExternalLink href={solanaAddressExplorerLink(report.mint_address)}>
              {report.mint_address.slice(0, 6)}…{report.mint_address.slice(-6)}
            </ExternalLink>
          </div>
        )}

        {report.founder_payout_signature && (
          <div className="mt-6 rounded-lg border-l-4 border-[#3B82F6] bg-[#EFF6FF] p-4">
            <p className="text-[#111827]">
              <span className="font-semibold">
                The founder received {formatUsdc(report.founder_usdc)} USDC.
              </span>{' '}
              Founders receive no tokens.
            </p>
          </div>
        )}

        {report.total_holders > 0 && (
          <p className="mt-4 text-sm text-[#6B7280]">
            {holderDistributionMessage(
              report.total_holders,
              report.claimed_count,
              report.dust_count
            )}
          </p>
        )}
      </div>

      {(report.lp_burn_signature || report.authority_revoke_signature) && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
            Verifiable trust claims
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {report.lp_burn_signature && (
              <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm">
                <p className="font-semibold text-[#10B981]">LP tokens burned</p>
                <p className="mt-1 text-[#6B7280]">
                  The platform burned its liquidity-provider tokens. No one can withdraw this
                  liquidity.
                </p>
                <div className="mt-3">
                  <ExternalLink href={solanaTxExplorerLink(report.lp_burn_signature)}>
                    View burn transaction
                  </ExternalLink>
                </div>
              </div>
            )}
            {report.authority_revoke_signature && (
              <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm">
                <p className="font-semibold text-[#10B981]">Mint authority revoked</p>
                <p className="mt-1 text-[#6B7280]">
                  The token&apos;s mint authority has been revoked. No more tokens can ever be
                  created.
                </p>
                <div className="mt-3">
                  <ExternalLink href={solanaTxExplorerLink(report.authority_revoke_signature)}>
                    View revoke transaction
                  </ExternalLink>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
