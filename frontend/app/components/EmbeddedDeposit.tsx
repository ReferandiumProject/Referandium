'use client'

import { useEffect, useMemo, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { useUser } from '../context/UserContext'

const NETWORK_FEE_USDC = 0.02
const MINIMUM_DEPOSIT_USDC = 1.0
const USDC_DECIMALS = 6

function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export default function EmbeddedDeposit({ onSuccess }: { onSuccess?: () => void }) {
  const { getAccessToken } = usePrivy()
  const { dbUser } = useUser()
  const { connection } = useConnection()
  const { wallets } = useWallets()
  const { signAndSendTransaction } = useSignAndSendTransaction()

  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [depositInfo, setDepositInfo] = useState<{ platform_address: string; usdc_mint: string } | null>(null)
  const [depositInfoLoading, setDepositInfoLoading] = useState(false)

  const custodialAddress = dbUser?.custodial_wallet_address

  const amountNumber = useMemo(() => parseFloat(amount), [amount])
  const netUsdc = useMemo(
    () => (Number.isFinite(amountNumber) ? amountNumber - NETWORK_FEE_USDC : 0),
    [amountNumber]
  )
  const canSubmit = useMemo(
    () =>
      !loading &&
      Number.isFinite(amountNumber) &&
      amountNumber >= MINIMUM_DEPOSIT_USDC + NETWORK_FEE_USDC &&
      balance !== null &&
      amountNumber <= balance,
    [loading, amountNumber, balance]
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setDepositInfoLoading(true)
      try {
        const res = await fetch('/api/deposit/wallet', { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (res.ok && json.platform_address && json.usdc_mint && !cancelled) {
          setDepositInfo(json)
        }
      } finally {
        if (!cancelled) setDepositInfoLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!connection || !depositInfo?.usdc_mint || !custodialAddress) return
    let cancelled = false
    const fetchBalance = async () => {
      try {
        const source = await getAssociatedTokenAddress(
          new PublicKey(depositInfo.usdc_mint),
          new PublicKey(custodialAddress)
        )
        const bal = await connection.getTokenAccountBalance(source)
        if (!cancelled) {
          setBalance(Number(bal.value.amount) / 10 ** USDC_DECIMALS)
        }
      } catch {
        if (!cancelled) setBalance(0)
      }
    }
    fetchBalance()
    return () => {
      cancelled = true
    }
  }, [connection, depositInfo, custodialAddress])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    try {
      const token = await getAccessToken()
      if (!token) {
        setMessage({ type: 'error', text: 'Not authenticated' })
        return
      }

      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        setMessage({ type: 'error', text: 'Enter a valid amount' })
        return
      }

      if (amountNumber < MINIMUM_DEPOSIT_USDC + NETWORK_FEE_USDC) {
        setMessage({
          type: 'error',
          text: `Minimum deposit is ${MINIMUM_DEPOSIT_USDC} USDC. Enter at least ${(
            MINIMUM_DEPOSIT_USDC + NETWORK_FEE_USDC
          ).toFixed(2)} USDC to cover the ${NETWORK_FEE_USDC} USDC network fee.`,
        })
        return
      }

      if (balance !== null && amountNumber > balance) {
        setMessage({ type: 'error', text: 'Insufficient USDC in embedded wallet' })
        return
      }

      const wallet = wallets.find((w) => w.address === custodialAddress)
      if (!wallet) {
        setMessage({ type: 'error', text: 'Embedded wallet not ready. Please refresh and try again.' })
        return
      }

      const buildRes = await fetch('/api/deposit/embedded/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount_usdc: amountNumber }),
      })
      const build = await buildRes.json().catch(() => ({}))
      if (!buildRes.ok) {
        setMessage({ type: 'error', text: build.error || 'Unable to build deposit transaction' })
        return
      }

      const txBytes = base64ToUint8Array(build.serialized)

      const result = await signAndSendTransaction({
        transaction: txBytes,
        wallet,
      })

      const signatureBase58 = bs58.encode(result.signature)

      const confirmRes = await fetch('/api/deposit/wallet/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ signature: signatureBase58 }),
      })
      const confirm = await confirmRes.json().catch(() => ({}))
      if (!confirmRes.ok) {
        setMessage({
          type: 'error',
          text: confirm.error || 'Deposit confirmation failed. The funds may still have moved.',
        })
        return
      }

      setMessage({
        type: 'success',
        text: `Credited ${confirm.credited_amount} USDC. New balance: ${confirm.new_balance}`,
      })
      setAmount('')
      onSuccess?.()
    } catch (err: any) {
      const text = err?.message || 'Deposit failed'
      const lower = text.toLowerCase()
      if (lower.includes('blockhash') || lower.includes('expired')) {
        setMessage({
          type: 'error',
          text: 'The transaction expired before it could be submitted. This happens when approval is slow. Please try again.',
        })
      } else {
        setMessage({ type: 'error', text })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[#6B7280]">
          <span className="font-medium text-[#111827]">Embedded wallet:</span>{' '}
          <span className="font-mono break-all">{custodialAddress ?? 'Loading...'}</span>
        </p>
        <p className="text-sm text-[#6B7280]">
          <span className="font-medium text-[#111827]">USDC balance:</span>{' '}
          {balance === null
            ? 'Loading...'
            : `${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}
        </p>
      </div>

      <p className="text-xs text-[#6B7280]">
        Send USDC (Solana) to the address above. Then enter the amount to deposit here. A flat{' '}
        {NETWORK_FEE_USDC} USDC network fee is withheld, and the minimum deposit is{' '}
        {MINIMUM_DEPOSIT_USDC} USDC (so enter at least{' '}
        {(MINIMUM_DEPOSIT_USDC + NETWORK_FEE_USDC).toFixed(2)} USDC).
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount USDC"
          disabled={loading}
          className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] sm:w-48 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Depositing...' : 'Deposit from embedded wallet'}
        </button>
      </form>

      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === 'error'
              ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
              : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
          }`}
        >
          {message.text}
        </div>
      )}

      {Number.isFinite(amountNumber) && amountNumber >= 0 && (
        <p className="text-xs text-[#6B7280]">
          {netUsdc >= 0
            ? `${amountNumber.toFixed(2)} USDC entered. ${netUsdc.toFixed(2)} USDC will be credited to your platform balance.`
            : 'Amount too small to cover the network fee.'}
        </p>
      )}
    </div>
  )
}
