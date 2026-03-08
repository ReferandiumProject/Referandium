'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowLeft, CheckCircle, XCircle, MessageSquare, Send, Loader2, Trash2, TrendingUp, Clock } from 'lucide-react';
import { Market, MarketOption, Signal, Comment } from '@/app/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const ADMIN_WALLET = 'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da';
const MIN_SIGNAL_AMOUNT = 0.05; // Minimum 0.05 SOL per signal

export default function MarketDetailClient() {
  const params = useParams();
  const id = params?.id as string;
  const { publicKey, connected } = useWallet();

  const [market, setMarket] = useState<Market | null>(null);
  const [options, setOptions] = useState<MarketOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'yes' | 'no'>('yes');
  const [selectedOption, setSelectedOption] = useState<MarketOption | null>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSignaled, setHasSignaled] = useState(false);
  const [userSignal, setUserSignal] = useState<Signal | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);

  // Fetch market data on mount
  useEffect(() => {
    fetchMarketData();
    fetchComments();
    fetchSignals();
  }, [id]);

  // Check if user has signaled when wallet connects
  useEffect(() => {
    if (connected && publicKey && market) {
      checkIfUserSignaled();
    }
  }, [connected, publicKey, market]);

  // Detect market type
  const isBinaryMarket = market?.market_type === 'binary';

  const fetchMarketData = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setMarket(data as Market);
      }

      // Fetch options separately
      const { data: optionsData } = await supabase
        .from('market_options')
        .select('*')
        .eq('market_id', id)
        .order('created_at', { ascending: true });

      if (optionsData) {
        setOptions(optionsData as MarketOption[]);
        if (optionsData.length > 0) {
          setSelectedOption(optionsData[0]);
        }
      }

      // Refresh signals after fetching market data
      await fetchSignals();
    } catch (error) {
      console.error('Error fetching market:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignals = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .eq('market_id', id);
      
      if (data) {
        setSignals(data as Signal[]);
      }
    } catch (error) {
      console.error('Error fetching signals:', error);
    }
  };

  const fetchComments = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('market_id', id)
      .order('created_at', { ascending: true });

    if (data) setComments(data);
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !connected || !publicKey || !id) return;

    setIsPostingComment(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          market_id: id,
          user_wallet: publicKey.toBase58(),
          content: commentText.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setComments(prev => [...prev, data]);
      }
      setCommentText('');
    } catch (error: any) {
      console.error('Comment error:', error);
      setNotification({ type: 'error', message: 'Failed to post comment.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setComments(prev => prev.filter(c => c.id !== commentId));
      setNotification({ type: 'success', message: 'Comment deleted.' });
      setTimeout(() => setNotification(null), 2000);
    } catch (error: any) {
      console.error('Delete comment error:', error);
      setNotification({ type: 'error', message: 'Failed to delete comment.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const checkIfUserSignaled = async () => {
    if (!publicKey) return;
    
    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .eq('market_id', id)
        .eq('user_wallet', publicKey.toBase58())
        .single();
      
      if (data) {
        setHasSignaled(true);
        setUserSignal(data as Signal);
      } else {
        setHasSignaled(false);
        setUserSignal(null);
      }
    } catch (error) {
      // No signal found (which is fine)
      setHasSignaled(false);
      setUserSignal(null);
    }
  };

  const handleSubmitSignal = async () => {
    // Validation: Wallet must be connected
    if (!connected || !publicKey) {
      setNotification({ type: 'error', message: 'Please connect your Solana wallet first!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Check if user already signaled
    if (hasSignaled) {
      setNotification({ type: 'error', message: 'You have already signaled on this market' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Validation: Amount must be valid and >= 0.05 SOL
    const signalAmount = parseFloat(amount);
    if (!signalAmount || signalAmount < MIN_SIGNAL_AMOUNT) {
      setNotification({ type: 'error', message: `Minimum signal amount is ${MIN_SIGNAL_AMOUNT} SOL` });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare signal data
      const signalData: any = {
        market_id: market!.id,
        user_wallet: publicKey.toBase58(),
        signal_direction: selectedTab,
        sol_amount: signalAmount,
        deposit_tx_signature: null // Off-chain: no on-chain tx for now
      };
      
      // Include option_id for multi-option markets
      if (!isBinaryMarket && selectedOption) {
        signalData.option_id = selectedOption.id;
      }
      
      // Insert signal into Supabase
      const { error: signalError } = await supabase.from('signals').insert(signalData);
      
      if (signalError) {
        // Handle unique constraint violation (error code 23505)
        if (signalError.code === '23505' || signalError.message.includes('duplicate') || signalError.message.includes('unique')) {
          throw new Error('You have already signaled on this market');
        } else if (signalError.message.includes('violates foreign key')) {
          throw new Error('Invalid market or option');
        } else if (signalError.message.includes('permission denied') || signalError.message.includes('policy')) {
          throw new Error('Permission denied. Please check authentication.');
        } else {
          throw new Error(signalError.message || 'Failed to submit signal');
        }
      }

      // Success: Database triggers will automatically update market stats
      setHasSignaled(true);
      setNotification({ type: 'success', message: `Signal ${selectedTab.toUpperCase()} submitted successfully! 🎉` });
      setAmount('');
      
      // Refresh data
      await Promise.all([
        fetchMarketData(),
        fetchSignals(),
        checkIfUserSignaled()
      ]);

    } catch (error: any) {
      console.error('Signal submission error:', error);
      const errorMessage = error.message || 'Failed to submit signal. Please try again.';
      setNotification({ type: 'error', message: errorMessage });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading market...</div>;
  if (!market) return <div className="min-h-screen flex items-center justify-center text-gray-500">Market not found</div>;

  // Calculate signal percentages for binary markets
  const totalSignals = Number(market.total_signals) || 0;
  const yesSignals = signals.filter(s => s.signal_direction === 'yes').length;
  const noSignals = signals.filter(s => s.signal_direction === 'no').length;
  const yesPercent = totalSignals === 0 ? 0 : Math.round((yesSignals / totalSignals) * 100);
  const noPercent = totalSignals === 0 ? 0 : Math.round((noSignals / totalSignals) * 100);
  
  // Check market status
  const isClosed = market.status === 'closed';
  const isDraft = market.status === 'draft';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] py-8 px-4 relative">
      
      {/* Notification */}
      {notification && (
        <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center gap-3 text-white font-bold ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
          {notification.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Back Link */}
        <Link href="/markets" className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition">
          <ArrowLeft size={16} />
          Back to Markets
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN (2/3) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Title */}
            <div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {market.title}
                </h1>
                {market.description && (
                  <p className="text-gray-600 dark:text-gray-400 mb-4">{market.description}</p>
                )}
                
                {/* Market Status Badge */}
                <div className="flex items-center gap-3 mb-6">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    isClosed ? 'bg-gray-500 text-white' : 
                    isDraft ? 'bg-yellow-500 text-white' :
                    'bg-green-500 text-white'
                  }`}>
                    {market.status.toUpperCase()}
                  </span>
                  {market.gookie_wallet && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Manager: {market.gookie_wallet.slice(0, 4)}...{market.gookie_wallet.slice(-4)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Market Options (Only show for Multiple Choice markets) */}
            {!isBinaryMarket && options && options.length > 0 && (
              <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Market Options</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select an option to signal</p>
                </div>
                <div>
                  {options.map((option: MarketOption) => {
                    const isSelected = selectedOption?.id === option.id;
                    // Calculate percentage based on signal count (wallet count, not SOL amount)
                    const optionYesSignals = option.yes_signals || 0;
                    const optionNoSignals = option.no_signals || 0;
                    const optionTotalSignals = optionYesSignals + optionNoSignals;
                    const optionYesPercent = optionTotalSignals > 0 ? Math.round((optionYesSignals / optionTotalSignals) * 100) : 0;
                    
                    return (
                      <div
                        key={option.id}
                        onClick={() => {
                          if (!hasSignaled) {
                            setSelectedOption(option);
                            setNotification(null);
                          }
                        }}
                        className={`flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800 last:border-0 transition-colors ${
                          hasSignaled
                            ? 'opacity-50 bg-gray-100 dark:bg-gray-800/50'
                            : `cursor-pointer ${isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                              : 'hover:bg-gray-50 dark:hover:bg-[#1A1C24]'}`
                        }`}
                      >
                        <div className="flex-1">
                          <h3 className={`font-semibold ${
                            hasSignaled 
                              ? 'text-gray-500 dark:text-gray-500' 
                              : 'text-gray-900 dark:text-white'
                          }`}>{option.title}</h3>
                          {option.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                              {optionYesPercent}% YES
                            </span>
                            <p className="text-xs text-gray-500">
                              {optionTotalSignals} signals
                            </p>
                          </div>
                          {isSelected && !hasSignaled && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800 mt-8 border-t pt-6">
              <div className="px-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageSquare size={22} className="text-blue-600" />
                  Comments
                  <span className="ml-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    {comments.length}
                  </span>
                </h2>
              </div>

              <div className="p-6">
                {comments.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <MessageSquare size={36} className="mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No comments yet.</p>
                    <p className="text-sm">Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  <div className="space-y-4 mb-8 max-h-[500px] overflow-y-auto pr-2">
                    {comments.map((comment) => {
                      const wallet = comment.user_wallet || '';
                      const shortWallet = wallet.length > 8 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
                      const avatarColors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500'];
                      const colorIndex = wallet.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % avatarColors.length;
                      const avatarColor = avatarColors[colorIndex];

                      return (
                        <div key={comment.id} className="flex gap-3 group">
                          <div className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {wallet.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono">{shortWallet}</span>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{comment.content}</p>
                          </div>
                          {connected && publicKey && (
                            publicKey.toBase58() === ADMIN_WALLET || publicKey.toBase58() === comment.user_wallet
                          ) && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="p-1.5 text-red-400 hover:text-red-600 rounded-lg transition opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Comment Form */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                  {!connected ? (
                    <div className="text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                      <p className="text-gray-400 text-sm font-medium">Connect your wallet to comment</p>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Share your thoughts..."
                        rows={3}
                        className="flex-1 p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0B0C10] text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                      />
                      <button
                        onClick={handlePostComment}
                        disabled={!commentText.trim() || isPostingComment}
                        className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition disabled:opacity-40"
                      >
                        {isPostingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (1/3) - Trading Panel */}
          <div className="lg:col-span-1">
            <div 
              key={selectedOption?.id || 'no-selection'}
              className="bg-white dark:bg-[#181A20] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm sticky top-24"
            >
              {/* Check if user has already signaled */}
              {hasSignaled ? (
                <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-600 dark:text-green-400" />
                  <h3 className="text-lg font-bold text-green-800 dark:text-green-400 mb-2">Signal Submitted!</h3>
                  <p className="text-sm text-green-600 dark:text-green-500 mb-2">
                    You signaled <strong>{userSignal?.signal_direction.toUpperCase()}</strong> with <strong>{userSignal?.sol_amount} SOL</strong>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    1 wallet = 1 signal per market. You'll receive your SOL + yield share when the market closes.
                  </p>
                  
                  {/* Share on X Button */}
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      `I just signaled ${userSignal?.signal_direction.toUpperCase()} on "${market.title}" on @Referandium! 💊\n\n${typeof window !== 'undefined' ? window.location.href : ''}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F1419] py-3 text-sm font-bold text-white transition-all hover:bg-[#272C30] hover:shadow-lg dark:bg-white dark:text-black dark:hover:bg-gray-200"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Share your signal
                  </a>
                </div>
              ) : isClosed ? (
                <div className="text-center p-6 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <XCircle size={48} className="mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">Market Closed</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This market is no longer accepting signals.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                    {isBinaryMarket ? (
                      <>
                        <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Signal on:</span>
                        {market.title}
                      </>
                    ) : selectedOption ? (
                      <>
                        <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Signaling on:</span>
                        {selectedOption.title}
                      </>
                    ) : (
                      'Submit Signal'
                    )}
                  </h3>
                  
                  {/* YES / NO Tabs */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <button
                      onClick={() => setSelectedTab('yes')}
                      className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        selectedTab === 'yes'
                          ? 'bg-green-500 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div>YES</div>
                      <div className="text-xs opacity-80">{yesPercent}% ({yesSignals} wallets)</div>
                    </button>
                    <button
                      onClick={() => setSelectedTab('no')}
                      className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        selectedTab === 'no'
                          ? 'bg-red-500 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div>NO</div>
                      <div className="text-xs opacity-80">{noPercent}% ({noSignals} wallets)</div>
                    </button>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Amount (SOL) <span className="text-xs text-gray-500">min {MIN_SIGNAL_AMOUNT}</span>
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={MIN_SIGNAL_AMOUNT.toString()}
                      step="0.01"
                      min={MIN_SIGNAL_AMOUNT}
                      className="w-full px-4 py-3 bg-gray-100 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-semibold text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      💡 Your SOL amount affects your yield share, not your vote weight. 1 wallet = 1 vote.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmitSignal}
                    disabled={!connected || isSubmitting || !amount || hasSignaled || isClosed}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      selectedTab === 'yes'
                        ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl'
                        : 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={20} className="animate-spin" /> Submitting...
                      </span>
                    ) : (
                      `Signal ${selectedTab.toUpperCase()}`
                    )}
                  </button>

                  <p className="text-xs text-gray-400 text-center mt-4">
                    {!connected ? 'Connect wallet to signal' : hasSignaled ? 'Already signaled' : isClosed ? 'Market closed' : 'Off-chain signaling (no SOL transfer yet)'}
                  </p>
                </>
              )}

              {/* Market Stats */}
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <TrendingUp size={14} /> Total SOL Locked
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">{Number(market.total_sol_locked).toFixed(2)} SOL</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total Signals</span>
                  <span className="font-bold text-gray-900 dark:text-white">{totalSignals} wallets</span>
                </div>
                {Number(market.total_yield_earned) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Yield Earned</span>
                    <span className="font-bold text-green-600 dark:text-green-400">{Number(market.total_yield_earned).toFixed(4)} SOL</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock size={14} /> Ends
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {new Date(market.end_time).toLocaleDateString()}
                  </span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
