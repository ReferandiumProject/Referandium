'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { supabase } from '../../../lib/supabaseClient'
import { Market, MarketOption, Signal, Comment } from '@/app/types'
import * as marketEscrowContract from '@/app/utils/marketEscrowContract'
import MarketChart from '../../components/MarketChart'

const ADMIN_WALLET = 'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da'
const MIN_SIGNAL_AMOUNT = 0.05

const formatDate = (dateString: string) => {
  const d = new Date(dateString)
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`
}

export default function MarketDetailClient() {
  const params = useParams()
  const id = params?.id as string
  const wallet = useWallet()
  const { publicKey, connected } = wallet
  const { connection } = useConnection()

  const [market, setMarket] = useState<Market | null>(null)
  const [options, setOptions] = useState<MarketOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'yes' | 'no'>('yes')
  const [selectedOption, setSelectedOption] = useState<MarketOption | null>(null)
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSignaled, setHasSignaled] = useState(false)
  const [userSignal, setUserSignal] = useState<Signal | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [signals, setSignals] = useState<Signal[]>([])
  const [onChainSignal, setOnChainSignal] = useState<any | null>(null)
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  useEffect(() => {
    fetchMarketData()
    fetchComments()
    fetchSignals()
  }, [id])

  useEffect(() => {
    if (connected && publicKey && market) {
      checkIfUserSignaled()
      checkOnChainSignal()
    }
  }, [connected, publicKey, market])

  const isBinaryMarket = market?.market_type === 'binary'

  const fetchMarketData = async () => {
    if (!id) return
    try {
      const { data, error } = await supabase.from('markets').select('*').eq('id', id).single()
      if (error) throw error
      if (data) setMarket(data as Market)

      const { data: optionsData } = await supabase
        .from('market_options').select('*').eq('market_id', id).order('created_at', { ascending: true })
      if (optionsData) {
        setOptions(optionsData as MarketOption[])
        if (optionsData.length > 0) setSelectedOption(optionsData[0])
      }
      await fetchSignals()
    } catch (error) {
      console.error('Error fetching market:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSignals = async () => {
    if (!id) return
    try {
      const { data } = await supabase.from('signals').select('*').eq('market_id', id)
      if (data) setSignals(data as Signal[])
    } catch (error) {
      console.error('Error fetching signals:', error)
    }
  }

  const fetchComments = async () => {
    if (!id) return
    const { data } = await supabase.from('comments').select('*').eq('market_id', id).order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  const handlePostComment = async () => {
    if (!commentText.trim() || !connected || !publicKey || !id) return
    setIsPostingComment(true)
    try {
      const { data, error } = await supabase.from('comments').insert({ market_id: id, user_wallet: publicKey.toBase58(), content: commentText.trim() }).select().single()
      if (error) throw error
      if (data) setComments(prev => [...prev, data])
      setCommentText('')
    } catch (error: any) {
      console.error('Comment error:', error)
      showNotification('error', 'Failed to post comment.')
    } finally {
      setIsPostingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId)
      if (error) throw error
      setComments(prev => prev.filter(c => c.id !== commentId))
      showNotification('success', 'Comment deleted.')
    } catch (error: any) {
      console.error('Delete comment error:', error)
      showNotification('error', 'Failed to delete comment.')
    }
  }

  const checkOnChainSignal = async () => {
    if (!publicKey || !market?.on_chain_market_id) return
    try {
      const signal = await marketEscrowContract.getUserSignal(connection, market.on_chain_market_id, publicKey)
      setOnChainSignal(signal)
      if (signal && !signal.withdrawn) setHasSignaled(true)
    } catch (error) {
      console.error('Error fetching on-chain signal:', error)
      setOnChainSignal(null)
    }
  }

  const checkIfUserSignaled = async () => {
    if (!publicKey) return
    try {
      const { data } = await supabase.from('signals').select('*').eq('market_id', id).eq('user_wallet', publicKey.toBase58()).single()
      if (data) { setHasSignaled(true); setUserSignal(data as Signal) }
      else { setHasSignaled(false); setUserSignal(null) }
    } catch { setHasSignaled(false); setUserSignal(null) }
  }

  const handleWithdraw = async () => {
    if (!connected || !publicKey || !wallet.wallet || !market?.on_chain_market_id) {
      showNotification('error', 'Please connect your wallet first!')
      return
    }
    if (!onChainSignal || onChainSignal.withdrawn) {
      showNotification('error', 'No signal to withdraw or already withdrawn')
      return
    }
    setIsWithdrawing(true)
    try {
      const tx = await marketEscrowContract.withdraw(wallet.wallet, publicKey, connection, market.on_chain_market_id)
      await supabase.from('signals').update({ principal_returned: true, yield_claimed: true, withdrawal_tx_signature: tx }).eq('market_id', id).eq('user_wallet', publicKey.toBase58())
      showNotification('success', `Withdrawal successful! Tx: ${tx.slice(0, 8)}...`)
      await checkOnChainSignal()
      await checkIfUserSignaled()
    } catch (error: any) {
      console.error('Withdraw error:', error)
      showNotification('error', error.message || 'Failed to withdraw')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleSubmitSignal = async () => {
    if (!connected || !publicKey || !wallet.wallet) {
      showNotification('error', 'Please connect your Solana wallet first!')
      return
    }
    if (hasSignaled) { showNotification('error', 'You have already signaled on this market'); return }
    const signalAmount = parseFloat(amount)
    if (!signalAmount || signalAmount < MIN_SIGNAL_AMOUNT) {
      showNotification('error', `Minimum signal amount is ${MIN_SIGNAL_AMOUNT} SOL`)
      return
    }
    setIsSubmitting(true)
    try {
      let depositTx = null
      if (market?.on_chain_market_id) {
        const signalDirection = selectedTab === 'yes' ? 1 : 0
        depositTx = await marketEscrowContract.depositSignal(wallet.wallet, publicKey, connection, market.on_chain_market_id, signalAmount, signalDirection)
      }
      const signalData: any = { market_id: market!.id, user_wallet: publicKey.toBase58(), signal_direction: selectedTab, sol_amount: signalAmount, deposit_tx_signature: depositTx }
      if (!isBinaryMarket && selectedOption) signalData.option_id = selectedOption.id
      const { error: signalError } = await supabase.from('signals').insert(signalData)
      if (signalError) {
        if (signalError.code === '23505' || signalError.message.includes('duplicate') || signalError.message.includes('unique')) throw new Error('You have already signaled on this market')
        else if (signalError.message.includes('violates foreign key')) throw new Error('Invalid market or option')
        else if (signalError.message.includes('permission denied') || signalError.message.includes('policy')) throw new Error('Permission denied. Please check authentication.')
        else throw new Error(signalError.message || 'Failed to submit signal')
      }
      setHasSignaled(true)
      const txMsg = depositTx ? ` Tx: ${depositTx.slice(0, 8)}...` : ''
      showNotification('success', `Signal ${selectedTab.toUpperCase()} submitted on-chain!${txMsg}`)
      setAmount('')
      await Promise.all([fetchMarketData(), fetchSignals(), checkIfUserSignaled(), checkOnChainSignal()])
    } catch (error: any) {
      console.error('Signal submission error:', error)
      showNotification('error', error.message || 'Failed to submit signal. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  /* ── Loading / Not found ── */
  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )
  if (!market) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-2">
      <p className="text-slate-900 font-medium">Market not found</p>
      <Link href="/markets" className="text-blue-600 text-sm font-medium hover:underline">← Back to Markets</Link>
    </div>
  )

  /* ── Derived data ── */
  const totalSignals = Number(market.total_signals) || 0
  const yesSignals = signals.filter(s => s.signal_direction === 'yes').length
  const noSignals = signals.filter(s => s.signal_direction === 'no').length
  const yesPercent = totalSignals === 0 ? 0 : Math.round((yesSignals / totalSignals) * 100)
  const noPercent = totalSignals === 0 ? 0 : Math.round((noSignals / totalSignals) * 100)
  const isClosed = market.status === 'closed'
  const isDraft = market.status === 'draft'

  return (
    <div className="bg-white min-h-screen">

      {/* Notification toast */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {notification.message}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Back */}
        <Link href="/markets" className="text-slate-400 text-sm font-medium hover:text-slate-600 transition no-underline mb-8 inline-block">
          ← Back to Markets
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* ── LEFT COLUMN (2/3) ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Title + badges */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {market.category && (
                  <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2.5 py-0.5 rounded-full">{market.category}</span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                  market.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                  market.status === 'closed' ? 'bg-slate-100 text-slate-500' :
                  'bg-amber-50 text-amber-600'
                }`}>
                  {market.status}
                </span>
                {market.gookie_wallet && (
                  <span className="text-xs font-medium text-blue-600">✓ Verified Gookie</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug">{market.title}</h1>
              {market.description && (
                <p className="text-slate-500 text-sm mt-3 leading-relaxed">{market.description}</p>
              )}
            </div>

            {/* Resolve criteria */}
            {market.resolve_criteria && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Resolution criteria</p>
                <p className="text-sm text-slate-700 leading-relaxed">{market.resolve_criteria}</p>
              </div>
            )}

            {/* Market Options (multiple choice) */}
            {!isBinaryMarket && options.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <h2 className="text-sm font-semibold text-slate-900">Market Options</h2>
                </div>
                {options.map((option: MarketOption) => {
                  const isSelected = selectedOption?.id === option.id
                  const optionYes = option.yes_signals || 0
                  const optionNo = option.no_signals || 0
                  const optionTotal = optionYes + optionNo
                  const optionYesPct = optionTotal > 0 ? Math.round((optionYes / optionTotal) * 100) : 0
                  return (
                    <div
                      key={option.id}
                      onClick={() => { if (!hasSignaled) { setSelectedOption(option); setNotification(null) } }}
                      className={`flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 transition-colors ${
                        hasSignaled ? 'opacity-50' : `cursor-pointer ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'hover:bg-slate-50'}`
                      }`}
                    >
                      <div>
                        <p className={`text-sm font-medium ${hasSignaled ? 'text-slate-400' : 'text-slate-900'}`}>{option.title}</p>
                        {option.description && <p className="text-xs text-slate-400 mt-0.5">{option.description}</p>}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-slate-900">{optionYesPct}%</span>
                        <p className="text-xs text-slate-400">{optionTotal} signals</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Chart */}
            <MarketChart marketId={id} isSimpleMarket={isBinaryMarket} />

            {/* Comments */}
            <div className="border border-slate-200 rounded-xl">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Comments</h2>
                <span className="text-xs text-slate-400">{comments.length}</span>
              </div>
              <div className="p-5">
                {comments.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No comments yet. Be the first to share your thoughts.</p>
                ) : (
                  <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                    {comments.map((comment) => {
                      const w = comment.user_wallet || ''
                      const short = w.length > 8 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w
                      return (
                        <div key={comment.id} className="flex gap-3 group">
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                            {w.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-slate-500 font-mono">{short}</span>
                            <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">{comment.content}</p>
                          </div>
                          {connected && publicKey && (publicKey.toBase58() === ADMIN_WALLET || publicKey.toBase58() === comment.user_wallet) && (
                            <button onClick={() => handleDeleteComment(comment.id)} className="text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 text-xs">
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Comment form */}
                {!connected ? (
                  <div className="text-center py-3 border border-dashed border-slate-200 rounded-lg">
                    <p className="text-slate-400 text-xs">Connect your wallet to comment</p>
                  </div>
                ) : (
                  <div className="flex gap-2 border-t border-slate-100 pt-4">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                      placeholder="Write a comment..."
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={handlePostComment}
                      disabled={!commentText.trim() || isPostingComment}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-40"
                    >
                      {isPostingComment ? '...' : 'Post'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (1/3) — Signal Panel ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">

              {/* Signal Card */}
              <div className="border border-slate-200 rounded-xl p-5">

                {hasSignaled ? (
                  /* ── Already signaled ── */
                  <div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center">
                      <p className="text-emerald-600 font-semibold text-sm mb-1">Signal Submitted</p>
                      <p className="text-slate-700 text-sm">
                        You signaled <strong>{userSignal?.signal_direction.toUpperCase()}</strong> with <strong>{userSignal?.sol_amount} SOL</strong>
                      </p>
                      <p className="text-slate-400 text-xs mt-2">1 wallet = 1 signal. You&apos;ll receive your SOL + yield share when the market closes.</p>
                    </div>
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just signaled ${userSignal?.signal_direction.toUpperCase()} on "${market.title}" on @Referandium!\n\n${typeof window !== 'undefined' ? window.location.href : ''}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition no-underline"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                      Share on X
                    </a>
                  </div>

                ) : isClosed ? (
                  /* ── Market closed ── */
                  <div className="text-center py-6">
                    <p className="text-slate-900 font-semibold mb-1">Market Closed</p>
                    <p className="text-slate-400 text-sm">This market is no longer accepting signals.</p>
                  </div>

                ) : (
                  /* ── Signal form ── */
                  <>
                    {!isBinaryMarket && selectedOption && (
                      <p className="text-xs text-slate-400 mb-1">Signaling on: <span className="text-slate-700 font-medium">{selectedOption.title}</span></p>
                    )}

                    {/* YES / NO buttons */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <button
                        onClick={() => setSelectedTab('yes')}
                        className={`py-3 rounded-lg text-sm font-semibold transition-colors ${
                          selectedTab === 'yes'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        YES {yesPercent}%
                      </button>
                      <button
                        onClick={() => setSelectedTab('no')}
                        className={`py-3 rounded-lg text-sm font-semibold transition-colors ${
                          selectedTab === 'no'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        NO {noPercent}%
                      </button>
                    </div>

                    {/* Amount */}
                    <div className="mb-4">
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Amount (SOL) <span className="text-slate-400">min {MIN_SIGNAL_AMOUNT}</span></label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={MIN_SIGNAL_AMOUNT.toString()}
                        step="0.01"
                        min={MIN_SIGNAL_AMOUNT}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 font-semibold text-base outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-xs text-slate-400 mt-1.5">SOL amount affects yield share, not vote weight. 1 wallet = 1 vote.</p>
                    </div>

                    {/* Submit */}
                    <button
                      onClick={handleSubmitSignal}
                      disabled={!connected || isSubmitting || !amount || hasSignaled || isClosed}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Submitting...' : `Signal ${selectedTab.toUpperCase()}`}
                    </button>
                    <p className="text-xs text-slate-400 text-center mt-2">
                      {!connected ? 'Connect wallet to signal' : 'On-chain signal via Solana escrow'}
                    </p>
                  </>
                )}
              </div>

              {/* Stats Card */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total SOL Locked</span>
                  <span className="font-semibold text-slate-900">{Number(market.total_sol_locked).toFixed(2)} SOL</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total Signals</span>
                  <span className="font-semibold text-slate-900">{totalSignals} wallets</span>
                </div>
                {Number(market.total_yield_earned) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Yield Earned</span>
                    <span className="font-semibold text-emerald-600">{Number(market.total_yield_earned).toFixed(4)} SOL</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ends</span>
                  <span className="font-semibold text-slate-900">{formatDate(market.end_time)}</span>
                </div>
              </div>

              {/* Vault Card */}
              {market.escrow_pda && (
                <div className="border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-semibold text-slate-900 mb-2">Vault</p>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-400">Escrow</span>
                    <a
                      href={`https://explorer.solana.com/address/${market.escrow_pda}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {market.escrow_pda.slice(0, 4)}...{market.escrow_pda.slice(-4)}
                    </a>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    SOL is held in a Solana smart contract escrow. Principal is always returned when market closes.
                  </p>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
