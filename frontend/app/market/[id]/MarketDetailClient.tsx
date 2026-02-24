'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowLeft, CheckCircle, XCircle, MessageSquare, Send, Loader2, Trash2 } from 'lucide-react';
import MarketChart from '@/app/components/MarketChart';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const ADMIN_WALLET = 'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da';

export default function MarketDetailClient() {
  const params = useParams();
  const id = params?.id as string;
  const { publicKey, connected } = useWallet();

  const [market, setMarket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'yes' | 'no'>('yes');
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [votedOptionIds, setVotedOptionIds] = useState<string[]>([]);
  const [lastVoteDirection, setLastVoteDirection] = useState<'yes' | 'no'>('yes');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);

  // Veri Çekme
  useEffect(() => {
    fetchMarketData();
    fetchComments();
  }, [id]);

  // Detect market type
  const isBinaryMarket = !market?.options || market.options.length === 0;

  // Kullanıcı oy vermiş mi kontrolü
  useEffect(() => {
    if (connected && publicKey && market) {
      checkIfVoted();
    }
  }, [connected, publicKey, market]);

  const fetchMarketData = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('markets')
      .select('*, options:market_options(*)')
      .eq('id', id)
      .single();
    
    if (data) {
      setMarket(data);
      if (data.options && data.options.length > 0) {
        setSelectedOption(data.options[0]);
      }
    }
    setLoading(false);
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

  const checkIfVoted = async () => {
    const { data } = await supabase
      .from('votes')
      .select('option_id')
      .eq('market_id', id)
      .eq('user_wallet', publicKey?.toBase58());
    
    if (data && data.length > 0) {
      const optionIds = data
        .filter(vote => vote.option_id !== null)
        .map(vote => vote.option_id);
      setVotedOptionIds(optionIds);
    }
  };

  const handleSubmitVote = async () => {
    // Validation: Wallet must be connected
    if (!connected || !publicKey) {
      setNotification({ type: 'error', message: 'Please connect your Solana wallet first!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Validation: Amount must be valid
    const voteAmount = parseFloat(amount);
    if (!voteAmount || voteAmount <= 0) {
      setNotification({ type: 'error', message: 'Please enter a valid amount!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      // Off-chain voting: Store signal directly in database (no blockchain transaction)
      const voteData: any = {
        market_id: market.id,
        user_wallet: publicKey.toBase58(),
        vote_direction: selectedTab,
        amount_sol: voteAmount,
        transaction_signature: null // Off-chain: no on-chain tx for now
      };
      
      // Include option_id for multi-option markets
      if (selectedOption) {
        voteData.option_id = selectedOption.id;
      }
      
      // Insert vote into Supabase
      const { error: voteError } = await supabase.from('votes').insert(voteData);
      
      if (voteError) {
        // Better error messages for common issues
        if (voteError.message.includes('duplicate key') || voteError.message.includes('unique')) {
          throw new Error('You have already voted on this market.');
        } else if (voteError.message.includes('violates foreign key')) {
          throw new Error('Invalid market or option ID.');
        } else if (voteError.message.includes('permission denied') || voteError.message.includes('policy')) {
          throw new Error('Database permission error. Please check RLS policies.');
        } else {
          throw new Error(voteError.message || 'Failed to submit vote.');
        }
      }

      // Success: Database triggers will automatically update market stats
      setLastVoteDirection(selectedTab);
      setNotification({ type: 'success', message: 'Signal submitted successfully! 🎉' });
      
      // Add voted option to the list (for multi-option markets)
      if (selectedOption) {
        setVotedOptionIds(prev => [...prev, selectedOption.id]);
      }
      
      setAmount('');
      
      // Refresh market data and chart to show updated stats
      await fetchMarketData();
      setChartRefreshKey(prev => prev + 1);

    } catch (error: any) {
      console.error('Vote submission error:', error);
      const errorMessage = error.message || 'Failed to submit signal. Please try again.';
      setNotification({ type: 'error', message: errorMessage });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Yükleniyor...</div>;
  if (!market) return <div className="min-h-screen flex items-center justify-center">Piyasa bulunamadı.</div>;

  // Hesaplamalar
  const totalVotes = (market.yes_count || 0) + (market.no_count || 0);
  const yesPercent = totalVotes === 0 ? 0 : Math.round((market.yes_count / totalVotes) * 100);
  const noPercent = totalVotes === 0 ? 0 : Math.round((market.no_count / totalVotes) * 100);
  
  // Check if current selected option has been voted on
  const hasVotedCurrentOption = selectedOption ? votedOptionIds.includes(selectedOption.id) : false;

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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                {market.title || market.question}
              </h1>
              
              {/* Chart */}
              <MarketChart 
                key={chartRefreshKey}
                marketId={market.id}
                isSimpleMarket={isBinaryMarket}
                selectedOptionId={isBinaryMarket ? undefined : selectedOption?.id}
              />
            </div>

            {/* Market Options (Only show for Multiple Choice markets) */}
            {!isBinaryMarket && market.options && market.options.length > 0 && (
              <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Market Options</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select an option to prescribe</p>
                </div>
                <div>
                  {market.options.map((option: any) => {
                    const isSelected = selectedOption?.id === option.id;
                    const hasVotedThisOption = votedOptionIds.includes(option.id);
                    // Calculate percentage based on vote count (not pool)
                    const optionYesCount = option.yes_count || 0;
                    const optionNoCount = option.no_count || 0;
                    const optionTotalVotes = optionYesCount + optionNoCount;
                    const yesPercent = optionTotalVotes > 0 ? Math.round((optionYesCount / optionTotalVotes) * 100) : 0;
                    
                    return (
                      <div
                        key={option.id}
                        onClick={() => {
                          setSelectedOption(option);
                          setNotification(null);
                        }}
                        className={`flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800 last:border-0 transition-colors cursor-pointer ${
                          hasVotedThisOption
                            ? 'opacity-50 bg-gray-100 dark:bg-gray-800/50'
                            : isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                            : 'hover:bg-gray-50 dark:hover:bg-[#1A1C24]'
                        }`}
                      >
                        <div className="flex-1">
                          <h3 className={`font-semibold ${
                            hasVotedThisOption 
                              ? 'text-gray-500 dark:text-gray-500' 
                              : 'text-gray-900 dark:text-white'
                          }`}>{option.title}</h3>
                          {hasVotedThisOption && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium mt-1 inline-block">
                              ✓ Voted
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                            {yesPercent}% Yes
                          </span>
                          {isSelected && !hasVotedThisOption && (
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
              {/* Check if user has voted on the currently selected option (not all options) */}
              {hasVotedCurrentOption ? (
                <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-600 dark:text-green-400" />
                  <h3 className="text-lg font-bold text-green-800 dark:text-green-400 mb-2">Already Voted!</h3>
                  <p className="text-sm text-green-600 dark:text-green-500">You've already voted on this option.</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Select a different option to vote again.</p>
                  
                  {/* Share on X Button */}
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      `I just prescribed ${lastVoteDirection.toUpperCase()} on "${market.title || market.question}" at Referandium! 💊 What's your take? 👇\n\n${typeof window !== 'undefined' ? window.location.href : ''}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F1419] py-3 text-sm font-bold text-white transition-all hover:bg-[#272C30] hover:shadow-lg dark:bg-white dark:text-black dark:hover:bg-gray-200"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Share your prescription
                  </a>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                    {isBinaryMarket ? (
                      <>
                        <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Market:</span>
                        {market.title || market.question}
                      </>
                    ) : selectedOption ? (
                      <>
                        <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Prescribing:</span>
                        {selectedOption.title}
                      </>
                    ) : (
                      'Prescribe Policy'
                    )}
                  </h3>
                  
                  {/* YES / NO Tabs */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <button
                      onClick={() => setSelectedTab('yes')}
                      className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        selectedTab === 'yes'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      YES {yesPercent}%
                    </button>
                    <button
                      onClick={() => setSelectedTab('no')}
                      className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                        selectedTab === 'no'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      NO {noPercent}%
                    </button>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Amount (SOL)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 bg-gray-100 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-semibold text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmitVote}
                    disabled={!connected || isSubmitting || !amount || (selectedOption && votedOptionIds.includes(selectedOption.id))}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      selectedTab === 'yes'
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
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
                    {!connected && 'Connect wallet to signal'}
                  </p>
                </>
              )}

              {/* Market Stats */}
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total Volume</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{market.total_pool?.toFixed(2)} SOL</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total Votes</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{totalVotes}</span>
                </div>
              </div>

              {/* Pump.fun Trade Button */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 mt-4">
                <a
                  href="https://pump.fun/coin/8248ZQSM717buZAkWFRbsLEcgetSArqbpbkX638Vpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-center items-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold transition-all duration-200 shadow-md hover:shadow-xl hover:-translate-y-0.5"
                >
                  💊 Trade Market on pump.fun
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
