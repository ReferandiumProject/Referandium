'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { ArrowLeft, Clock, AlertCircle, Loader2, Trophy, ArrowRight, Wallet, ShieldCheck, CheckCircle } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Treasury wallet for escrow (placeholder)
const TREASURY_WALLET = new PublicKey('5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP');

// Minimum bid increment
const MIN_BID_INCREMENT = 0.05;

// Anti-sniper: extend auction by 5 minutes if bid placed within last 5 minutes
const ANTI_SNIPER_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds
const EXTENSION_DURATION = 5 * 60 * 1000; // Extend by 5 minutes

export default function GookieDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [gookie, setGookie] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    if (id) {
      fetchGookieDetails();
      fetchBids();
    }
  }, [id]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchWalletBalance();
    } else {
      setWalletBalance(null);
    }
  }, [connected, publicKey]);

  const fetchWalletBalance = async () => {
    if (!publicKey || !connection) return;
    
    setLoadingBalance(true);
    try {
      const balance = await connection.getBalance(publicKey);
      setWalletBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Error fetching balance:', error);
      setWalletBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (!gookie) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(gookie.end_time).getTime();
      const distance = end - now;

      if (distance < 0 || gookie.status === 'closed') {
        setIsEnded(true);
        setTimeLeft('Auction Ended');
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      let timeString = '';
      if (days > 0) timeString += `${days}d `;
      if (hours > 0 || days > 0) timeString += `${hours}h `;
      timeString += `${minutes}m ${seconds}s`;
      
      // Add visual indicator if in anti-sniper window (last 5 minutes)
      if (distance < ANTI_SNIPER_WINDOW && distance > 0) {
        setTimeLeft(`${timeString} 🔥`);
      } else {
        setTimeLeft(timeString);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [gookie]);

  const fetchGookieDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('gookies')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      setGookie(data);
      
      // Auto-close logic check (if time passed but status is active)
      if (data.status === 'active' && new Date(data.end_time).getTime() < new Date().getTime()) {
        await supabase
          .from('gookies')
          .update({ status: 'closed' })
          .eq('id', id);
        setGookie({ ...data, status: 'closed' });
      }
    } catch (error) {
      console.error('Error fetching gookie:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBids = async () => {
    try {
      const { data, error } = await supabase
        .from('gookie_bids')
        .select('*')
        .eq('gookie_id', id)
        .order('bid_amount', { ascending: false });
        
      if (error) throw error;
      setBids(data || []);
    } catch (error) {
      console.error('Error fetching bids:', error);
    }
  };

  const handlePlaceBid = async () => {
    if (!connected || !publicKey || !sendTransaction) {
      setNotification({ type: 'error', message: 'Please connect your wallet first!' });
      return;
    }

    const amount = parseFloat(bidAmount);
    // Calculate minimum required bid with 0.05 SOL increment
    const minRequiredBid = gookie.current_highest_bid > 0 
      ? parseFloat(gookie.current_highest_bid) + MIN_BID_INCREMENT
      : parseFloat(gookie.starting_bid);

    if (isNaN(amount) || amount < minRequiredBid) {
      setNotification({ 
        type: 'error', 
        message: `Bid must be at least ${minRequiredBid.toFixed(2)} SOL (minimum ${MIN_BID_INCREMENT} SOL increment)` 
      });
      return;
    }

    // Check wallet balance
    if (walletBalance !== null && amount > walletBalance) {
      setNotification({ 
        type: 'error', 
        message: `Insufficient balance. You have ${walletBalance.toFixed(4)} SOL` 
      });
      return;
    }

    if (isEnded) {
      setNotification({ type: 'error', message: 'This auction has ended.' });
      return;
    }

    setIsSubmitting(true);
    setNotification(null);

    try {
      // 1. Create and send SOL transfer transaction to treasury
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: TREASURY_WALLET,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );

      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction and get signature
      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error('Transaction failed to confirm');
      }

      // 2. Anti-Sniper Check: Check if we need to extend auction time
      const now = new Date().getTime();
      const auctionEndTime = new Date(gookie.end_time).getTime();
      const timeRemaining = auctionEndTime - now;
      
      let newEndTime = null;
      let auctionExtended = false;

      if (timeRemaining < ANTI_SNIPER_WINDOW && timeRemaining > 0) {
        // Bid placed within last 5 minutes - extend auction
        newEndTime = new Date(now + EXTENSION_DURATION).toISOString();
        auctionExtended = true;

        // Update gookies table with new end_time
        const { error: updateError } = await supabase
          .from('gookies')
          .update({ end_time: newEndTime })
          .eq('id', id);

        if (updateError) {
          console.error('Error extending auction:', updateError);
        }
      }

      // 3. Insert bid to Supabase AFTER successful transaction
      const { error: bidError } = await supabase
        .from('gookie_bids')
        .insert({
          gookie_id: id,
          user_wallet: publicKey.toBase58(),
          bid_amount: amount
        });

      if (bidError) throw bidError;

      // Show appropriate success message
      if (auctionExtended) {
        setNotification({ 
          type: 'success', 
          message: '🔥 Sniper prevented! Auction extended by 5 minutes. Bid placed successfully!' 
        });
      } else {
        setNotification({ type: 'success', message: 'Bid placed successfully! 🎉' });
      }
      
      setBidAmount('');
      
      // Refresh Data
      await fetchGookieDetails();
      await fetchBids();
      await fetchWalletBalance(); // Refresh balance after transaction

    } catch (error: any) {
      console.error('Bidding error:', error);
      
      // Handle different error types
      if (error.message?.includes('User rejected')) {
        setNotification({ type: 'error', message: 'Transaction cancelled by user.' });
      } else if (error.message?.includes('insufficient')) {
        setNotification({ type: 'error', message: 'Insufficient SOL for transaction and fees.' });
      } else {
        setNotification({ type: 'error', message: error.message || 'Failed to place bid.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50 dark:bg-[#0B0C10]">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!gookie) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50 dark:bg-[#0B0C10]">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Gookie Not Found</h1>
        <Link href="/gookies" className="text-blue-500 hover:underline">Return to Gookies</Link>
      </div>
    );
  }

  const currentBid = gookie.current_highest_bid > 0 ? parseFloat(gookie.current_highest_bid) : parseFloat(gookie.starting_bid);
  const minimumBid = gookie.current_highest_bid > 0 
    ? parseFloat(gookie.current_highest_bid) + MIN_BID_INCREMENT 
    : parseFloat(gookie.starting_bid);

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B0C10] pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Back Navigation */}
        <Link href="/gookies" className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 mb-6 transition font-medium">
          <ArrowLeft size={16} /> Back to Auctions
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN - Image & Info (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Main Image Card */}
            <div className="bg-white dark:bg-[#181A20] rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="aspect-square md:aspect-video relative bg-gray-100 dark:bg-gray-800">
                {gookie.image_url ? (
                  <img 
                    src={gookie.image_url} 
                    alt={gookie.title} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl">🍪</span>
                  </div>
                )}
                
                {/* Status Badge */}
                <div className="absolute top-6 right-6">
                  <span className={`px-4 py-2 rounded-2xl text-sm font-bold backdrop-blur-md border ${
                    isEnded 
                      ? 'bg-gray-900/80 border-gray-700 text-white' 
                      : 'bg-orange-500/90 border-orange-400 text-white shadow-xl shadow-orange-500/30'
                  }`}>
                    {isEnded ? 'AUCTION CLOSED' : 'LIVE AUCTION'}
                  </span>
                </div>
              </div>
              
              {/* Title & Description */}
              <div className="p-8">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
                  {gookie.title}
                </h1>
                
                <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 text-lg leading-relaxed">
                  {gookie.description ? (
                    <p>{gookie.description}</p>
                  ) : (
                    <p className="italic opacity-70">No description provided for this exclusive Gookie.</p>
                  )}
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <ShieldCheck size={16} className="text-green-500" />
                  Authentic Referandium Gookie
                </div>
              </div>
            </div>
            
            {/* Bid History (Desktop - shown under image, Mobile - shown at bottom) */}
            <div className="bg-white dark:bg-[#181A20] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <Trophy className="text-orange-500" size={24} /> 
                Bid History
              </h3>
              
              {bids.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
                  <p className="text-gray-500 dark:text-gray-400">No bids yet. Be the first to bid!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {bids.map((bid, index) => (
                    <div 
                      key={bid.id} 
                      className={`flex items-center justify-between p-4 rounded-2xl border ${
                        index === 0 
                          ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30' 
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                          index === 0 
                            ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>
                          #{index + 1}
                        </div>
                        <div>
                          <p className="font-mono text-sm text-gray-900 dark:text-white font-medium">
                            {bid.user_wallet.slice(0, 4)}...{bid.user_wallet.slice(-4)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(bid.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-lg ${index === 0 ? 'text-orange-500' : 'text-gray-900 dark:text-white'}`}>
                          {bid.bid_amount} SOL
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN - Bidding Panel (1/3 width) */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[#181A20] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 sm:p-8 sticky top-24">
              
              {/* Countdown Timer */}
              <div className="bg-gray-50 dark:bg-[#0B0C10] rounded-2xl p-4 mb-8 flex items-center justify-between border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 font-medium">
                  <Clock size={18} className={isEnded ? '' : 'text-orange-500'} />
                  {isEnded ? 'Auction Ended' : 'Ends In'}
                </div>
                <div className={`text-xl font-bold tabular-nums ${isEnded ? 'text-gray-500 dark:text-gray-400' : 'text-orange-500'}`}>
                  {timeLeft}
                </div>
              </div>

              {/* Current Status */}
              <div className="mb-8">
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-2 uppercase tracking-wider">
                  {gookie.current_highest_bid > 0 ? 'Current Highest Bid' : 'Starting Bid'}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                    {currentBid}
                  </span>
                  <span className="text-xl font-bold text-gray-500 dark:text-gray-400">SOL</span>
                </div>
                
                {gookie.highest_bidder_wallet && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                      <Trophy size={14} />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Highest Bidder</p>
                      <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                        {gookie.highest_bidder_wallet.slice(0, 4)}...{gookie.highest_bidder_wallet.slice(-4)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <hr className="border-gray-100 dark:border-gray-800 mb-8" />

              {/* Bidding Form */}
              {isEnded ? (
                <div className="text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                  <Trophy size={40} className="mx-auto mb-3 text-gray-400" />
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Auction Closed</h4>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {gookie.highest_bidder_wallet 
                      ? `Won by ${gookie.highest_bidder_wallet.slice(0,4)}...${gookie.highest_bidder_wallet.slice(-4)}`
                      : 'Ended with no bids.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Notification */}
                  {notification && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 ${
                      notification.type === 'success' 
                        ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' 
                        : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                    } border`}>
                      {notification.type === 'success' ? <CheckCircle size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
                      <span className="text-sm font-medium">{notification.message}</span>
                    </div>
                  )}

                  {!connected ? (
                    <div className="text-center space-y-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Connect your wallet to place a bid</p>
                      <div className="flex justify-center">
                        <WalletMultiButton className="!bg-orange-500 hover:!bg-orange-600 !rounded-xl !h-12 !px-8 !font-bold !transition-colors w-full flex justify-center" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Wallet Balance Display */}
                      {walletBalance !== null && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900/30">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wallet size={18} className="text-blue-600 dark:text-blue-400" />
                              <span className="text-sm font-medium text-blue-900 dark:text-blue-300">
                                Wallet Balance
                              </span>
                            </div>
                            <div className="text-right">
                              {loadingBalance ? (
                                <Loader2 size={16} className="animate-spin text-blue-600" />
                              ) : (
                                <p className="font-bold text-lg text-blue-600 dark:text-blue-400">
                                  {walletBalance.toFixed(4)} SOL
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                          Your Bid Amount (SOL)
                        </label>
                        
                        {/* Minimum Bid Info */}
                        <div className="mb-3 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-200 dark:border-orange-900/30">
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                            Minimum bid: <span className="font-bold">{minimumBid.toFixed(2)} SOL</span>
                            <span className="text-xs ml-2 opacity-75">({MIN_BID_INCREMENT} SOL increment)</span>
                          </p>
                        </div>

                        <div className="relative">
                          <input
                            type="number"
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            placeholder={minimumBid.toFixed(2)}
                            step="0.01"
                            min={minimumBid}
                            className="w-full pl-6 pr-16 py-4 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white font-bold text-xl focus:ring-2 focus:ring-orange-500 outline-none transition-shadow"
                          />
                          <div className="absolute inset-y-0 right-6 flex items-center pointer-events-none text-gray-500 font-bold">
                            SOL
                          </div>
                        </div>
                      </div>

                      {/* Validation Warnings */}
                      {bidAmount && parseFloat(bidAmount) < minimumBid && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
                          <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0" />
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">
                            Bid must be at least {minimumBid.toFixed(2)} SOL
                          </span>
                        </div>
                      )}
                      
                      {bidAmount && walletBalance !== null && parseFloat(bidAmount) > walletBalance && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
                          <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0" />
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">
                            Insufficient SOL Balance
                          </span>
                        </div>
                      )}

                      <button
                        onClick={handlePlaceBid}
                        disabled={
                          isSubmitting || 
                          !bidAmount || 
                          parseFloat(bidAmount || '0') < minimumBid ||
                          (walletBalance !== null && parseFloat(bidAmount || '0') > walletBalance)
                        }
                        className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 size={24} className="animate-spin" /> Processing...
                          </>
                        ) : (
                          <>
                            Place Bid <ArrowRight size={20} />
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
