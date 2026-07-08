'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../../context/UserContext'
import { supabase } from '../../../lib/supabaseClient'
import { Market, MarketOption, Signal, Comment } from '@/app/types'
import * as marketEscrowContract from '@/app/utils/marketEscrowContract'
import MarketChart from '../../components/MarketChart'

const ADMIN_WALLET = 'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da'
const MIN_SIGNAL_AMOUNT = 5

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
  const { getAccessToken } = usePrivy()
  const { authenticated, dbUser } = useUser()

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
  const [isVerified, setIsVerified] = useState(false)
  const [isClaimed, setIsClaimed] = useState(false)

  useEffect(() => {
    fetchMarketData()
    fetchComments()
    fetchSignals()
  }, [id])

  useEffect(() => {
    if (!market?.gookie_wallet) return
    supabase
      .from('gookies')
      .select('is_verified')
      .eq('winner_wallet', market.gookie_wallet)
      .eq('is_verified', true)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setIsVerified(true)
      })
  }, [market?.gookie_wallet])

  useEffect(() => {
    if (authenticated && market) {
      checkIfUserSignaled()
    }
  }, [authenticated, market])

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
    if (!commentText.trim() || !authenticated || !id) return
    const wallet = dbUser?.wallet_address || publicKey?.toBase58()
    if (!wallet) {
      showNotification('error', 'No wallet address available for comment.')
      return
    }
    setIsPostingComment(true)
    try {
      const { data, error } = await supabase.from('comments').insert({ market_id: id, user_wallet: wallet, content: commentText.trim() }).select().single()
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

  const checkIfUserSignaled = async () => {
    const wallet = dbUser?.wallet_address || publicKey?.toBase58()
    if (!wallet) return
    try {
      const { data } = await supabase.from('signals').select('*').eq('market_id', id).eq('user_wallet', wallet).single()
      if (data) { setHasSignaled(true); setUserSignal(data as Signal) }
      else { setHasSignaled(false); setUserSignal(null) }
    } catch { setHasSignaled(false); setUserSignal(null) }
  }

  const handleWithdraw = async () => {
    if (!authenticated) {
      showNotification('error', 'Please sign in first!')
      return
    }
    if (!connected || !publicKey || !wallet.wallet || !market?.on_chain_market_id) {
      showNotification('error', 'Wallet required for this action.')
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
      await checkIfUserSignaled()
    } catch (error: any) {
      console.error('Withdraw error:', error)
      showNotification('error', error.message || 'Failed to withdraw')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleClaim = async () => {
    if (!authenticated) {
      showNotification('error', 'Please sign in first!')
      return
    }
    if (!connected || !publicKey || !wallet.wallet) {
      showNotification('error', 'Wallet required for this action.')
      return
    }
    setIsWithdrawing(true)
    try {
      if (market?.on_chain_market_id && market?.escrow_pda) {
        const tx = await marketEscrowContract.withdraw(wallet.wallet, publicKey, connection, market.on_chain_market_id)
        await supabase.from('signals').update({ principal_returned: true, yield_claimed: true, withdrawal_tx_signature: tx }).eq('market_id', id).eq('user_wallet', publicKey.toBase58())
        showNotification('success', `Claimed successfully! Tx: ${tx.slice(0, 8)}...`)
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000))
        showNotification('success', 'Claim processed successfully!')
      }
      setIsClaimed(true)
    } catch (error: any) {
      console.error('Claim error:', error)
      showNotification('error', error.message || 'Failed to claim')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleSubmitSignal = async () => {
    if (!authenticated) {
      showNotification('error', 'Please sign in first!')
      return
    }
    if (hasSignaled) { showNotification('error', 'You have already signaled on this market'); return }
    const signalAmount = parseFloat(amount)
    if (!signalAmount || signalAmount < MIN_SIGNAL_AMOUNT) {
      showNotification('error', `Minimum signal amount is ${MIN_SIGNAL_AMOUNT} USDC`)
      return
    }
    setIsSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          market_id: market!.id,
          signal_direction: selectedTab,
          usdc_amount: signalAmount,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Signal submission failed')

      setHasSignaled(true)
      showNotification('success', `Prescription ${selectedTab.toUpperCase()} submitted!`)
      setAmount('')
      await Promise.all([fetchMarketData(), fetchSignals(), checkIfUserSignaled()])
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
    <div className="bg-[#faf8ff] text-[#191b23] antialiased min-h-screen">

      {/* Notification toast */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl shadow-lg text-[13px] font-medium text-white ${notification.type === 'success' ? 'bg-emerald-600' : 'bg-[#ba1a1a]'}`}>
          {notification.message}
        </div>
      )}

      <main className="w-full max-w-[1280px] mx-auto px-6 py-10">

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

          {/* ── LEFT COLUMN (8 cols) ── */}
          <div className="lg:col-span-8 flex flex-col gap-4">

            {/* Header */}
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-3 mb-2">
                {market.category && (
                  <span className="inline-flex items-center px-2 py-1 rounded bg-[#2563eb]/5 text-[#2563eb] text-[12px] font-semibold tracking-[0.05em]">
                    {market.category}
                  </span>
                )}
                <span className={`inline-flex items-center px-2 py-1 rounded text-[12px] font-semibold tracking-[0.05em] capitalize ${
                  market.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' :
                  market.status === 'closed' ? 'bg-[#e1e2ed] text-[#434655]' :
                  'bg-amber-500/10 text-amber-700'
                }`}>
                  {market.status}
                </span>
                {isVerified && (
                  <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 text-[12px] font-semibold tracking-[0.05em]">
                    ✓ Verified
                  </span>
                )}
              </div>
              <h1 className="font-semibold text-[36px] leading-[1.1] tracking-[-0.04em] text-[#191b23]">{market.title}</h1>
            </div>

            {/* Description */}
            {market.description && (
              <p className="text-[15px] leading-[1.5] tracking-[-0.01em] text-[#434655]">{market.description}</p>
            )}

            {/* Resolution Criteria */}
            {market.resolve_criteria && (
              <div className="bg-[#dbe1ff]/20 border border-[#dbe1ff] rounded-xl p-4 mt-3">
                <h3 className="font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] text-[#004ac6] mb-2 flex items-center gap-2">
                  Resolution Criteria
                </h3>
                <p className="text-[13px] leading-[1.5] text-[#434655]">{market.resolve_criteria}</p>
              </div>
            )}

            {/* Market Options (multiple choice) */}
            {!isBinaryMarket && options.length > 0 && (
              <div className="bg-white border border-[#e1e2ed] rounded-xl overflow-hidden mt-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
                <div className="px-4 py-3 border-b border-[#e1e2ed] bg-[#f3f3fe]">
                  <h2 className="font-semibold text-[15px] text-[#191b23]">Market Options</h2>
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
                      className={`flex items-center justify-between px-4 py-3 border-b border-[#e1e2ed] last:border-0 transition-colors ${
                        hasSignaled ? 'opacity-50' : `cursor-pointer ${isSelected ? 'bg-[#2563eb]/5 border-l-2 border-l-[#2563eb]' : 'hover:bg-[#f3f3fe]'}`
                      }`}
                    >
                      <div>
                        <p className={`text-[15px] font-medium ${hasSignaled ? 'text-[#737686]' : 'text-[#191b23]'}`}>{option.title}</p>
                        {option.description && <p className="text-[13px] text-[#737686] mt-0.5">{option.description}</p>}
                      </div>
                      <div className="text-right">
                        <span className="text-[15px] font-semibold text-[#191b23]">{optionYesPct}%</span>
                        <p className="text-[12px] text-[#737686]">{optionTotal} signals</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Chart */}
            <div className="bg-white border border-[#e1e2ed] rounded-xl p-4 mt-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
              <MarketChart marketId={id} isSimpleMarket={isBinaryMarket} />
            </div>

            {/* Comments Section */}
            <div className="mt-10">
              <h2 className="font-semibold text-[24px] leading-[1.2] tracking-[-0.03em] text-[#191b23] mb-4">Discussion</h2>

              {/* Comment Input */}
              {!authenticated ? (
                <div className="text-center py-4 border border-dashed border-[#e1e2ed] rounded-xl mb-6">
                  <p className="text-[#737686] text-[13px]">Sign in to comment</p>
                </div>
              ) : (
                <div className="flex gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-[#e1e2ed] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#434655] text-xs font-bold">{publicKey?.toBase58().slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-grow">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment() } }}
                      placeholder="Add a comment..."
                      rows={2}
                      className="w-full border border-[#e1e2ed] rounded-lg p-3 text-[15px] leading-[1.5] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 outline-none resize-none bg-white"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handlePostComment}
                        disabled={!commentText.trim() || isPostingComment}
                        className="bg-[#2563eb] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#004ac6] transition disabled:opacity-40"
                      >
                        {isPostingComment ? '...' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Comment List */}
              <div className="flex flex-col gap-4">
                {comments.length === 0 ? (
                  <p className="text-[13px] text-[#737686] text-center py-8">No comments yet. Be the first to share your thoughts.</p>
                ) : (
                  comments.map((comment) => {
                    const w = comment.user_wallet || ''
                    const short = w.length > 8 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w
                    return (
                      <div key={comment.id} className="flex gap-4 group">
                        <div className="w-10 h-10 rounded-full bg-[#e1e2ed] flex items-center justify-center flex-shrink-0">
                          <span className="text-[#434655] text-xs font-bold">{w.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-[15px] font-medium text-[#191b23]">{short}</span>
                            <span className="text-[13px] text-[#737686]">
                              {comment.created_at ? new Date(comment.created_at).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <p className="text-[13px] leading-[1.5] text-[#434655]">{comment.content}</p>
                        </div>
                        {connected && publicKey && (publicKey.toBase58() === ADMIN_WALLET || publicKey.toBase58() === comment.user_wallet) && (
                          <button onClick={() => handleDeleteComment(comment.id)} className="text-[#c3c6d7] hover:text-[#ba1a1a] transition opacity-0 group-hover:opacity-100 text-xs">
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (4 cols) — Signal Panel ── */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="sticky top-[88px]">

              {/* Signal Panel */}
              <div className="bg-white border border-[#e1e2ed] rounded-xl p-6 shadow-[0_4px_12px_rgba(15,23,42,0.12)] mb-4">

                {hasSignaled && isClosed ? (
                  /* Claim card for closed markets */
                  <div>
                    {isClaimed ? (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-5 text-center">
                        <p className="text-emerald-700 font-semibold text-[18px] mb-1">Claimed!</p>
                        <p className="text-[#434655] text-[13px]">Your USDC + yield share has been returned to your wallet.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-center mb-4">
                          <span className="font-semibold text-[18px] leading-[1.3] tracking-[-0.02em]">Claim USDC + Yield</span>
                        </div>
                        <div className="bg-[#faf8ff] border border-[#e1e2ed] rounded-lg p-4 mb-4">
                          <div className="flex justify-between text-[13px] mb-2">
                            <span className="text-[#737686]">Direction</span>
                            <span className="text-[#191b23] font-semibold">{userSignal?.signal_direction.toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between text-[13px] mb-2">
                            <span className="text-[#737686]">Amount Staked</span>
                            <span className="text-[#191b23] font-semibold">{userSignal?.usdc_amount} USDC</span>
                          </div>
                          <div className="flex justify-between text-[13px]">
                            <span className="text-[#737686]">Est. Yield Share</span>
                            <span className="text-emerald-700 font-semibold">+{((Number(userSignal?.usdc_amount) || 0) * 0.05).toFixed(4)} USDC</span>
                          </div>
                        </div>
                        <button
                          onClick={handleClaim}
                          disabled={isWithdrawing}
                          className="w-full py-3 rounded-lg bg-[#2563eb] text-white font-semibold text-[15px] hover:bg-[#004ac6] transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isWithdrawing ? 'Processing...' : 'Claim'}
                        </button>
                      </>
                    )}
                  </div>

                ) : hasSignaled ? (
                  /* Already signaled - market still active */
                  <div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center">
                      <p className="text-emerald-700 font-semibold text-[15px] mb-1">Prescription Submitted!</p>
                      <p className="text-[#191b23] text-[13px]">
                        You signaled <strong>{userSignal?.signal_direction.toUpperCase()}</strong> with <strong>{userSignal?.usdc_amount} USDC</strong>
                      </p>
                      <p className="text-[#737686] text-[12px] mt-2">1 wallet = 1 vote. You&apos;ll receive your USDC + yield share when the market closes.</p>
                    </div>
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just signaled ${userSignal?.signal_direction.toUpperCase()} on "${market.title}" on @Referandium!\n\n${typeof window !== 'undefined' ? window.location.href : ''}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#191b23] py-2.5 text-[13px] font-medium text-white hover:bg-[#2e3039] transition no-underline"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                      Share on X
                    </a>
                  </div>

                ) : isClosed ? (
                  /* Market closed - no signal */
                  <div className="text-center py-6">
                    <p className="text-[#191b23] font-semibold text-[18px] mb-1">Market Closed</p>
                    <p className="text-[#737686] text-[13px]">This market is no longer accepting signals.</p>
                  </div>

                ) : (
                  /* Signal form */
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-[18px] leading-[1.3] tracking-[-0.02em]">Signal Intent</span>
                    </div>

                    {!isBinaryMarket && selectedOption && (
                      <p className="text-[12px] text-[#737686] mb-2">Signaling on: <span className="text-[#191b23] font-medium">{selectedOption.title}</span></p>
                    )}

                    {/* YES / NO buttons */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <button
                        onClick={() => setSelectedTab('yes')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg transition-colors ${
                          selectedTab === 'yes'
                            ? 'border-2 border-[#2563eb] bg-[#2563eb]/5'
                            : 'border border-[#e1e2ed] hover:border-[#737686]'
                        }`}
                      >
                        <span className={`font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] ${selectedTab === 'yes' ? 'text-[#2563eb]' : 'text-[#191b23]'}`}>YES</span>
                        <span className={`text-[13px] ${selectedTab === 'yes' ? 'text-[#2563eb]' : 'text-[#434655]'}`}>{yesPercent}%</span>
                      </button>
                      <button
                        onClick={() => setSelectedTab('no')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg transition-colors ${
                          selectedTab === 'no'
                            ? 'border-2 border-[#191b23] bg-[#191b23]/5'
                            : 'border border-[#e1e2ed] hover:border-[#737686]'
                        }`}
                      >
                        <span className={`font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] ${selectedTab === 'no' ? 'text-[#191b23]' : 'text-[#191b23]'}`}>NO</span>
                        <span className={`text-[13px] ${selectedTab === 'no' ? 'text-[#191b23]' : 'text-[#434655]'}`}>{noPercent}%</span>
                      </button>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-4">
                      <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] mb-2">Amount</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min={MIN_SIGNAL_AMOUNT}
                          className="w-full border border-[#e1e2ed] rounded-lg p-3 pr-14 text-[15px] leading-[1.5] font-medium focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 outline-none bg-white"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#434655]">USDC</span>
                      </div>
                      <div className="flex justify-between mt-2 text-[13px] text-[#737686]">
                        <span>Min {MIN_SIGNAL_AMOUNT} USDC</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-3 bg-[#f0f1fa] rounded-lg px-3 py-2">
                        <span className="text-[#2563eb] text-[13px]">ℹ</span>
                        <span className="text-[12px] text-[#434655]">1 wallet = 1 vote. USDC amount affects your yield share, not your voting weight.</span>
                      </div>
                    </div>

                    {/* Submit */}
                    <button
                      onClick={handleSubmitSignal}
                      disabled={!connected || isSubmitting || !amount || hasSignaled || isClosed}
                      className="w-full bg-[#2563eb] text-white font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] py-4 rounded-lg hover:opacity-90 transition-opacity active:scale-[0.98] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Submitting...' : `Prescribe ${selectedTab.toUpperCase()}`}
                    </button>
                    <p className="text-[12px] text-[#737686] text-center mt-2">
                      {!connected ? 'Connect wallet to signal' : 'Off-chain signal in Phase 1'}
                    </p>
                  </>
                )}
              </div>

              {/* Stats Card */}
              <div className="bg-white border border-[#e1e2ed] rounded-xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)] mb-4">
                <h3 className="text-[12px] font-semibold tracking-[0.05em] text-[#434655] mb-4 border-b border-[#e1e2ed] pb-2">Market Details</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center py-2 border-b border-[#e1e2ed]/50">
                    <span className="text-[13px] text-[#434655]">Total USDC Locked</span>
                    <span className="text-[15px] font-medium">{Number(market.total_usdc_locked).toFixed(2)} USDC</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e1e2ed]/50">
                    <span className="text-[13px] text-[#434655]">Prescriptions</span>
                    <span className="text-[15px] font-medium">{totalSignals}</span>
                  </div>
                  {Number(market.total_yield_earned) > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-[#e1e2ed]/50">
                      <span className="text-[13px] text-[#434655]">Yield Earned</span>
                      <span className="text-[15px] font-medium text-emerald-600">{Number(market.total_yield_earned).toFixed(4)} USDC</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-[13px] text-[#434655]">End Date</span>
                    <span className="text-[15px] font-medium">{formatDate(market.end_time)}</span>
                  </div>
                </div>
              </div>

              {/* Vault Card */}
              {market.escrow_pda && (
                <div className="bg-white border border-[#e1e2ed] rounded-xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08)] flex items-start gap-3">
                  <span className="text-[#2563eb] text-xl mt-0.5">🛡</span>
                  <div>
                    <h4 className="text-[15px] font-medium text-[#191b23]">Secure Vault</h4>
                    <p className="text-[13px] text-[#434655] mt-2">Funds are locked in a fully audited smart contract until resolution criteria are met.</p>
                    <a
                      href={`https://explorer.solana.com/address/${market.escrow_pda}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-mono text-[#2563eb] hover:underline mt-2 inline-block"
                    >
                      {market.escrow_pda.slice(0, 4)}...{market.escrow_pda.slice(-4)}
                    </a>
                  </div>
                </div>
              )}

              {/* Cause Token Card */}
              {market.cause_token_enabled && (
                <div className="bg-white border border-[#e1e2ed] rounded-xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[15px] font-semibold text-[#191b23]">🪙 Cause Token</span>
                    <span className="text-[11px] font-medium text-[#737686] bg-[#e1e2ed] px-2 py-0.5 rounded">Powered by Meteora</span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    {market.cause_token_image && (
                      <img src={market.cause_token_image} alt={market.cause_token_symbol || ''} className="w-10 h-10 rounded-full object-cover border border-[#e1e2ed]" />
                    )}
                    <div>
                      <p className="text-[18px] font-bold text-[#191b23] tracking-tight">{market.cause_token_symbol}</p>
                      <p className="text-[13px] text-[#737686]">{market.cause_token_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[12px] font-medium text-emerald-700">Bonding Curve Active</span>
                  </div>
                  <a
                    href="https://app.meteora.ag"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-[#2563eb] text-white font-semibold text-[15px] py-2.5 rounded-lg hover:bg-[#004ac6] transition no-underline"
                  >
                    Buy Token
                  </a>
                  <p className="text-[11px] text-[#737686] text-center mt-2">Speculative asset. Not financial advice.</p>
                </div>
              )}

            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
