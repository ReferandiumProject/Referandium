'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection, PublicKey } from '@solana/web3.js'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { Gookie, Market } from '../types'
import * as marketEscrowContract from '../utils/marketEscrowContract'

const ADMIN_WALLETS = [
  'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da',
  '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP',
]

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed')

const formatDate = (d: string) => {
  const dt = new Date(d)
  return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}.${dt.getFullYear()}`
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    market_active: 'bg-emerald-50 text-emerald-600',
    market_closed: 'bg-slate-100 text-slate-500',
    active: 'bg-emerald-50 text-emerald-600',
    closed: 'bg-slate-100 text-slate-500',
    draft: 'bg-amber-50 text-amber-600',
  }
  return map[status] || 'bg-slate-100 text-slate-500'
}

export default function AdminPage() {
  const wallet = useWallet()
  const { connected, publicKey } = wallet
  const [activeTab, setActiveTab] = useState<'creators' | 'markets'>('creators')
  const [isAdmin, setIsAdmin] = useState(false)
  const [gookies, setGookies] = useState<Gookie[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [yieldAmounts, setYieldAmounts] = useState<Record<string, string>>({})
  const [marketCounts, setMarketCounts] = useState<Record<string, number>>({})

  // Add Creator form state
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newWalletAddress, setNewWalletAddress] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const showNotif = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  useEffect(() => {
    if (connected && publicKey) setIsAdmin(ADMIN_WALLETS.includes(publicKey.toBase58()))
    else setIsAdmin(false)
  }, [connected, publicKey])

  useEffect(() => {
    if (isAdmin) {
      if (activeTab === 'creators') fetchGookies()
      else fetchMarkets()
    }
  }, [activeTab, isAdmin])

  const fetchGookies = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('gookies').select('*').order('created_at', { ascending: false })
      if (error) throw error
      const gookieList = (data || []) as Gookie[]
      setGookies(gookieList)

      // Fetch market counts for each creator
      const counts: Record<string, number> = {}
      for (const g of gookieList) {
        if (g.winner_wallet) {
          const { count } = await supabase.from('markets').select('*', { count: 'exact', head: true }).eq('gookie_wallet', g.winner_wallet)
          counts[g.id] = count || 0
        } else {
          counts[g.id] = 0
        }
      }
      setMarketCounts(counts)
    } catch (error) { console.error('Error fetching gookies:', error) }
    finally { setLoading(false) }
  }

  const fetchMarkets = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('markets').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setMarkets((data || []) as Market[])
    } catch (error) { console.error('Error fetching markets:', error) }
    finally { setLoading(false) }
  }

  const handleAddCreator = async () => {
    if (!newDisplayName.trim() || !newWalletAddress.trim()) {
      showNotif('error', 'Display name and wallet address are required.')
      return
    }
    try {
      setIsSubmitting(true)
      const { error } = await supabase.from('gookies').insert({
        title: newDisplayName.trim(),
        description: newDescription.trim() || null,
        winner_wallet: newWalletAddress.trim(),
        is_verified: true,
        status: 'market_active',
      })
      if (error) throw error
      showNotif('success', `Creator "${newDisplayName.trim()}" added successfully.`)
      setNewDisplayName('')
      setNewWalletAddress('')
      setNewDescription('')
      fetchGookies()
    } catch (error: any) { showNotif('error', error.message || 'Failed to add creator') }
    finally { setIsSubmitting(false) }
  }

  const handleRemoveCreator = async (gookieId: string, name: string) => {
    if (!confirm(`Remove creator "${name}"? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('gookies').delete().eq('id', gookieId)
      if (error) throw error
      showNotif('success', `Creator "${name}" removed.`)
      fetchGookies()
    } catch (error: any) { showNotif('error', error.message || 'Failed to remove creator') }
  }

  const handleInitEscrowPlatform = async () => {
    if (!isAdmin || !publicKey || !wallet.wallet) return
    try {
      setIsSubmitting(true)
      const tx = await marketEscrowContract.initializeEscrowPlatform(wallet.wallet, publicKey, connection, publicKey)
      showNotif('success', `Escrow Platform initialized! Tx: ${tx.slice(0, 8)}...`)
    } catch (error: any) { showNotif('error', error.message || 'Failed to init escrow platform') }
    finally { setIsSubmitting(false) }
  }

  const handleSetYield = async (marketId: string) => {
    if (!publicKey || !wallet.wallet) return
    const market = markets.find(m => m.id === marketId)
    if (!market || !market.on_chain_market_id) { showNotif('error', 'On-chain market ID not found'); return }
    const yieldAmount = parseFloat(yieldAmounts[marketId] || '0')
    if (yieldAmount <= 0) { showNotif('error', 'Please enter a valid yield amount'); return }
    try {
      const tx = await marketEscrowContract.setYield(wallet.wallet, publicKey, connection, market.on_chain_market_id, yieldAmount)
      await supabase.from('markets').update({ total_yield_earned: yieldAmount }).eq('id', marketId)
      showNotif('success', `Yield set! Tx: ${tx.slice(0, 8)}...`)
      setYieldAmounts({ ...yieldAmounts, [marketId]: '' }); fetchMarkets()
    } catch (error: any) { showNotif('error', error.message || 'Failed to set yield') }
  }

  const handleCloseMarketOnChain = async (marketId: string) => {
    if (!confirm('Close this market on-chain?') || !publicKey || !wallet.wallet) return
    try {
      const market = markets.find(m => m.id === marketId)
      if (!market || !market.on_chain_market_id || !market.gookie_wallet) { showNotif('error', 'Missing on-chain data'); return }
      const gookieWallet = new PublicKey(market.gookie_wallet)
      const tx = await marketEscrowContract.closeMarket(wallet.wallet, publicKey, connection, market.on_chain_market_id, gookieWallet, publicKey)
      await supabase.from('markets').update({ status: 'closed', market_closed_tx: tx }).eq('id', marketId)
      if (market.gookie_id) await supabase.from('gookies').update({ status: 'market_closed' }).eq('id', market.gookie_id)
      showNotif('success', `Market closed! Tx: ${tx.slice(0, 8)}...`); fetchMarkets(); fetchGookies()
    } catch (error: any) { showNotif('error', error.message || 'Failed to close market') }
  }

  const handleWithdrawBuyback = async (marketId: string) => {
    if (!confirm('Withdraw 5% buyback amount to treasury?') || !publicKey || !wallet.wallet) return
    try {
      const market = markets.find(m => m.id === marketId)
      if (!market || !market.on_chain_market_id) { showNotif('error', 'On-chain market ID not found'); return }
      const tx = await marketEscrowContract.adminWithdrawBuyback(wallet.wallet, publicKey, connection, market.on_chain_market_id, publicKey)
      await supabase.from('markets').update({ buyback_burn_amount: market.total_yield_earned * 0.05 }).eq('id', marketId)
      showNotif('success', `Buyback withdrawn! Tx: ${tx.slice(0, 8)}...`); fetchMarkets()
    } catch (error: any) { showNotif('error', error.message || 'Failed to withdraw buyback') }
  }

  /* ── Gate screens ── */
  if (!connected) return (
    <div className="bg-white min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-slate-900 font-semibold">Admin Access Required</p>
      <p className="text-slate-400 text-sm">Connect your wallet to access the admin panel.</p>
    </div>
  )
  if (!isAdmin) return (
    <div className="bg-white min-h-screen flex flex-col items-center justify-center gap-2">
      <p className="text-slate-900 font-semibold">Access Denied</p>
      <p className="text-slate-400 text-sm">Your wallet is not authorized.</p>
      <p className="text-slate-300 text-xs font-mono mt-1">{publicKey?.toBase58()}</p>
    </div>
  )

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Panel</h1>
          <button onClick={handleInitEscrowPlatform} disabled={isSubmitting} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition disabled:opacity-40">Init Escrow</button>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`mb-6 px-4 py-2.5 rounded-lg text-sm font-medium ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
            {notification.message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-6 mb-6 border-b border-slate-200">
          <button onClick={() => setActiveTab('creators')} className={`pb-2.5 text-sm font-semibold transition ${activeTab === 'creators' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            Creators
          </button>
          <button onClick={() => setActiveTab('markets')} className={`pb-2.5 text-sm font-semibold transition ${activeTab === 'markets' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            Markets
          </button>
        </div>

        {/* ── CREATORS TAB ── */}
        {activeTab === 'creators' && (
          <>
            {/* Add Verified Creator Form */}
            <div className="border border-slate-200 rounded-xl p-5 mb-6 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Add Verified Creator</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Display Name *"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="text"
                  value={newWalletAddress}
                  onChange={(e) => setNewWalletAddress(e.target.value)}
                  placeholder="Wallet Address *"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleAddCreator}
                disabled={isSubmitting || !newDisplayName.trim() || !newWalletAddress.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Adding...' : 'Add Creator'}
              </button>
            </div>

            {/* Creators Table */}
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : gookies.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No creators found. Add one above.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Display Name</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Wallet Address</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Verified</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Markets</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gookies.map((g) => {
                      const displayName = g.display_name || g.title || '—'
                      const walletAddr = g.winner_wallet || ''
                      const shortWallet = walletAddr.length > 8 ? `${walletAddr.slice(0, 4)}...${walletAddr.slice(-4)}` : walletAddr || '—'
                      return (
                        <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{displayName}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{shortWallet}</td>
                          <td className="px-4 py-3">
                            {g.is_verified ? (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Verified</span>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Unverified</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900 font-medium tabular-nums">{marketCounts[g.id] ?? 0}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleRemoveCreator(g.id, displayName)}
                              className="px-2.5 py-1 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100 transition"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── MARKETS TAB ── */}
        {activeTab === 'markets' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : markets.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No markets found.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Title</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Signals</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">USDC</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Ends</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Yield</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {markets.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/market/${m.id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition no-underline">{m.title}</Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusBadge(m.status)}`}>{m.status}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 font-medium tabular-nums">{m.total_signals}</td>
                        <td className="px-4 py-3 text-sm text-slate-900 font-medium tabular-nums">{Number(m.total_usdc_locked).toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDate(m.end_time)}</td>
                        <td className="px-4 py-3">
                          {m.on_chain_market_id && m.status === 'active' && (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.001"
                                value={yieldAmounts[m.id] || ''}
                                onChange={(e) => setYieldAmounts({ ...yieldAmounts, [m.id]: e.target.value })}
                                placeholder="SOL"
                                className="w-20 border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button onClick={() => handleSetYield(m.id)} className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium hover:bg-blue-100 transition">Set</button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/market/${m.id}`} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200 transition no-underline">View</Link>
                            {m.status === 'active' && (
                              <button onClick={() => handleCloseMarketOnChain(m.id)} className="px-2.5 py-1 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100 transition">Close</button>
                            )}
                            {m.status === 'closed' && m.on_chain_market_id && (
                              <button onClick={() => handleWithdrawBuyback(m.id)} className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded text-xs font-medium hover:bg-amber-100 transition">Buyback</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
