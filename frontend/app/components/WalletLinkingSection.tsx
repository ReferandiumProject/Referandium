'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { usePrivy } from '@privy-io/react-auth'
import bs58 from 'bs58'
import { getWalletLinkMessage } from '@/lib/wallet-link'
import WalletButton from '@/app/components/ui/WalletButton'

type LinkedWallet = { address: string; created_at: string }

export default function WalletLinkingSection() {
  const { publicKey, signMessage, connected } = useWallet()
  const { getAccessToken } = usePrivy()
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const fetchLinked = async () => {
    setFetching(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/wallet/link', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Failed to load linked wallets' })
      } else {
        setLinkedWallets(json.linked_wallets || [])
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load linked wallets' })
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (connected) {
      fetchLinked()
    }
  }, [connected])

  const handleLink = async () => {
    if (!publicKey) return
    setMessage(null)
    setLoading(true)

    try {
      const address = publicKey.toBase58()
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const challengeRes = await fetch('/api/wallet/link/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ address }),
      })
      const challenge = await challengeRes.json().catch(() => ({}))
      if (!challengeRes.ok) {
        setMessage({ type: 'error', text: challenge.error || 'Failed to request challenge' })
        setLoading(false)
        return
      }

      if (!signMessage) {
        setMessage({ type: 'error', text: 'This wallet does not support message signing.' })
        setLoading(false)
        return
      }

      const encoded = new TextEncoder().encode(challenge.message)
      const signature = await signMessage(encoded)
      const signatureBase58 = bs58.encode(signature)

      const verifyRes = await fetch('/api/wallet/link/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address,
          nonce: challenge.nonce,
          signature: signatureBase58,
        }),
      })
      const verify = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok) {
        setMessage({ type: 'error', text: verify.error || 'Failed to link wallet' })
      } else {
        setMessage({ type: 'success', text: 'Wallet linked successfully.' })
        await fetchLinked()
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to link wallet' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-[#111827]">Linked wallets</h2>
      <p className="mb-4 text-sm text-[#6B7280]">
        Connect an external Solana wallet so deposits from it are credited to your account.
      </p>

      {!connected ? (
        <div className="mb-4">
          <WalletButton />
        </div>
      ) : (
        <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="text-sm">
            <span className="font-medium text-[#111827]">Selected wallet:</span>{' '}
            <span className="font-mono text-[#6B7280]">{publicKey?.toBase58()}</span>
          </div>
          <button
            type="button"
            onClick={handleLink}
            disabled={loading}
            className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Linking...' : 'Sign and link this wallet'}
          </button>
        </div>
      )}

      {message && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            message.type === 'error'
              ? 'border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]'
              : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
          }`}
        >
          {message.text}
        </div>
      )}

      {fetching ? (
        <p className="text-sm text-[#6B7280]">Loading linked wallets...</p>
      ) : linkedWallets.length === 0 ? (
        <p className="text-sm text-[#6B7280]">No linked wallets yet.</p>
      ) : (
        <ul className="divide-y divide-[#E5E7EB]">
          {linkedWallets.map((w) => (
            <li key={w.address} className="flex items-center justify-between py-3">
              <span className="font-mono text-sm text-[#111827]">{w.address}</span>
              <span className="text-xs text-[#6B7280]">
                {new Date(w.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
