'use client'

import { useEffect, useMemo, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { useUser } from '../context/UserContext'
import { Notice, buttonClass, cx, inputClass } from '@/app/components/ui'

const NETWORK_FEE_USDC = 0.02
const MINIMUM_DEPOSIT_USDC = 1.0
const USDC_DECIMALS = 6
const SIGNING_TIMEOUT_MS = 20000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

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
      amountNumber >= MINIMUM_DEPOSIT_USDC &&
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

      if (amountNumber < MINIMUM_DEPOSIT_USDC) {
        setMessage({
          type: 'error',
          text: `Minimum deposit is ${MINIMUM_DEPOSIT_USDC.toFixed(2)} USDC. The ${NETWORK_FEE_USDC} USDC network fee is withheld from that.`,
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

      const result = await withTimeout(
        signAndSendTransaction({
          transaction: txBytes,
          wallet,
        }),
        SIGNING_TIMEOUT_MS,
        'Signing the deposit transaction timed out after 20 seconds. Try again or refresh the page.'
      )

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
      <dl className="grid gap-3 rounded-lg bg-canvas p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
        <div className="min-w-0">
          <dt className="text-[13px] text-muted">Your embedded wallet</dt>
          <dd className="mt-0.5 break-all font-mono text-[13px] text-ink">{custodialAddress ?? 'Loading…'}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">USDC in wallet</dt>
          <dd className="num mt-0.5 font-medium text-ink">
            {balance === null
              ? 'Loading…'
              : `${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}
          </dd>
        </div>
      </dl>

      <p className="text-[13px] leading-relaxed text-muted">
        Send USDC (Solana) to the address above, then enter the amount to deposit. A flat{' '}
        {NETWORK_FEE_USDC} USDC network fee is withheld. The minimum deposit is{' '}
        {MINIMUM_DEPOSIT_USDC.toFixed(2)} USDC.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount USDC"
          disabled={loading}
          className={cx(inputClass, 'h-10 sm:w-48')}
        />
        <button type="submit" disabled={!canSubmit} className={buttonClass('primary', 'md', 'h-10')}>
          {loading ? 'Depositing…' : 'Deposit from embedded wallet'}
        </button>
      </form>

      {message && <Notice tone={message.type === 'error' ? 'no' : 'yes'}>{message.text}</Notice>}

      {Number.isFinite(amountNumber) && amountNumber >= 0 && (
        <p className="num text-[13px] text-muted">
          {amountNumber >= NETWORK_FEE_USDC
            ? `${amountNumber.toFixed(2)} USDC will be sent. ${netUsdc.toFixed(2)} USDC will be credited to your platform balance.`
            : 'Amount too small to cover the network fee.'}
        </p>
      )}
    </div>
  )
}
