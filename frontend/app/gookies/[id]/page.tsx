'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { ArrowLeft, Clock, AlertCircle, Loader2, Trophy, ArrowRight, Wallet, ShieldCheck, CheckCircle, Plus, Trash2, Sparkles, Calendar } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Gookie, GookieBid } from '@/app/types';
import * as gookieContract from '@/app/utils/gookieContract';
import * as marketEscrowContract from '@/app/utils/marketEscrowContract';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Minimum bid increment in RFRM tokens
const MIN_BID_INCREMENT_RFRM = 10;

// Anti-sniper: extend auction by 1 minute if bid placed within last 1 minute
const ANTI_SNIPER_WINDOW = 1 * 60 * 1000; // 1 minute in milliseconds
const EXTENSION_DURATION = 1 * 60 * 1000; // Extend by 1 minute

export default function GookieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const { connection } = useConnection();

  const [gookie, setGookie] = useState<Gookie | null>(null);
  const [bids, setBids] = useState<GookieBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Market Setup States
  const [marketTitle, setMarketTitle] = useState('');
  const [marketDescription, setMarketDescription] = useState('');
  const [marketType, setMarketType] = useState<'binary' | 'multiple'>('multiple');
  const [marketOptions, setMarketOptions] = useState<string[]>(['', '']);
  const [marketEndDate, setMarketEndDate] = useState('');
  const [isDeployingMarket, setIsDeployingMarket] = useState(false);

  useEffect(() => {
    if (id) {
      fetchGookieDetails();
      fetchBids();
    }
  }, [id]);

  // Set minimum market end date (cannot be before auction ends)
  useEffect(() => {
    if (gookie) {
      const minDate = new Date(gookie.auction_end_time);
      minDate.setDate(minDate.getDate() + 1); // At least 1 day after auction
      setMarketEndDate(minDate.toISOString().split('T')[0]);
    }
  }, [gookie]);

  useEffect(() => {
    if (!gookie) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(gookie.auction_end_time).getTime();
      const distance = end - now;

      if (distance < 0) {
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
      
      // Add visual indicator if in anti-sniper window (last 1 minute)
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
      setGookie(data as Gookie);
      
      // Auto-update status if auction ended but still showing 'auction'
      if (data.status === 'auction' && new Date(data.auction_end_time).getTime() < new Date().getTime()) {
        await supabase
          .from('gookies')
          .update({ status: 'won' })
          .eq('id', id);
        setGookie({ ...data, status: 'won' } as Gookie);
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
        .order('bid_amount_rfrm', { ascending: false });
        
      if (error) throw error;
      setBids((data || []) as GookieBid[]);
    } catch (error) {
      console.error('Error fetching bids:', error);
    }
  };

  // Market Setup Helper Functions
  const addOption = () => {
    if (marketOptions.length < 6) {
      setMarketOptions([...marketOptions, '']);
    }
  };

  const removeOption = (index: number) => {
    if (marketOptions.length > 2) {
      setMarketOptions(marketOptions.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...marketOptions];
    newOptions[index] = value;
    setMarketOptions(newOptions);
  };

  const handleDeployMarket = async () => {
    if (!connected || !publicKey || !wallet.wallet) {
      setNotification({ type: 'error', message: 'Please connect your wallet first!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!marketTitle.trim()) {
      setNotification({ type: 'error', message: 'Please enter a market title!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!marketEndDate) {
      setNotification({ type: 'error', message: 'Please select market end date!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (marketType === 'multiple') {
      const validOptions = marketOptions.filter(opt => opt.trim());
      if (validOptions.length < 2) {
        setNotification({ type: 'error', message: 'Multiple market requires at least 2 options!' });
        setTimeout(() => setNotification(null), 3000);
        return;
      }
    }

    if (!gookie || gookie.auction_id === undefined || gookie.auction_id === null) {
      setNotification({ type: 'error', message: 'Auction ID not found' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsDeployingMarket(true);
    setNotification(null);

    try {
      const marketId = crypto.randomUUID();
      
      const nftTx = await gookieContract.mintGookieNFT(
        wallet.wallet,
        publicKey,
        connection,
        gookie.auction_id,
        marketId
      );

      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .insert({
          id: marketId,
          title: marketTitle,
          description: marketDescription || null,
          category: 'Gookie',
          market_type: marketType,
          gookie_id: id,
          gookie_wallet: publicKey.toBase58(),
          end_time: new Date(marketEndDate).toISOString(),
          status: 'active',
          nft_mint_tx: nftTx,
        })
        .select()
        .single();

      if (marketError) {
        console.error('Market insert error:', marketError);
        throw new Error(`Failed to create market: ${marketError.message}`);
      }

      // Create market escrow on-chain
      try {
        const gookieWalletPubkey = new PublicKey(publicKey.toBase58());
        const escrowResult = await marketEscrowContract.createMarketEscrow(
          wallet.wallet,
          publicKey,
          connection,
          {
            marketId: marketData.id,
            gookieWallet: gookieWalletPubkey,
            endTime: Math.floor(new Date(marketEndDate).getTime() / 1000),
          }
        );

        // Update market in Supabase with escrow info
        await supabase.from('markets').update({
          escrow_pda: escrowResult.marketEscrowPDA,
          on_chain_market_id: marketData.id,
        }).eq('id', marketData.id);
        
        console.log('Escrow created:', escrowResult);
      } catch (escrowError: any) {
        console.error('ESCROW ERROR FULL:', escrowError);
        console.error('ESCROW ERROR MESSAGE:', escrowError?.message);
        console.error('ESCROW ERROR LOGS:', escrowError?.logs);
        // Don't throw - continue with market creation
      }

      if (marketType === 'multiple') {
        const validOptions = marketOptions.filter(opt => opt.trim());
        const optionsToInsert = validOptions.map(optTitle => ({
          market_id: marketId,
          title: optTitle
        }));

        const { error: optionsError } = await supabase
          .from('market_options')
          .insert(optionsToInsert);

        if (optionsError) throw optionsError;
      }

      const { error: gookieUpdateError } = await supabase
        .from('gookies')
        .update({ status: 'market_active', nft_mint_tx: nftTx })
        .eq('id', id);

      if (gookieUpdateError) throw gookieUpdateError;

      setNotification({ type: 'success', message: `🚀 NFT minted & market published! Tx: ${nftTx.slice(0, 8)}...` });
      
      setTimeout(() => {
        router.push(`/market/${marketId}`);
      }, 1500);

    } catch (error: any) {
      console.error('Market deployment error:', error);
      setNotification({ type: 'error', message: error.message || 'Failed to deploy market.' });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsDeployingMarket(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!connected || !publicKey || !wallet.wallet) {
      setNotification({ type: 'error', message: 'Please connect your wallet first!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const amount = parseFloat(bidAmount);
    const minRequiredBid = gookie!.winning_bid_rfrm > 0 
      ? gookie!.winning_bid_rfrm + MIN_BID_INCREMENT_RFRM
      : gookie!.starting_bid_rfrm;

    if (isNaN(amount) || amount < minRequiredBid) {
      setNotification({ 
        type: 'error', 
        message: `Bid must be at least ${minRequiredBid} RFRM (minimum ${MIN_BID_INCREMENT_RFRM} RFRM increment)` 
      });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (isEnded) {
      setNotification({ type: 'error', message: 'This auction has ended.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!gookie || !gookie.on_chain_address) {
      setNotification({ type: 'error', message: 'On-chain auction address not found' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsSubmitting(true);
    setNotification(null);

    try {
      const auctionPubkey = new PublicKey(gookie.on_chain_address);
      const bidAmountLamports = amount * 1_000_000_000;
      
      const tx = await gookieContract.placeBid(
        wallet.wallet,
        publicKey,
        connection,
        auctionPubkey,
        bidAmountLamports
      );

      const { error: bidError } = await supabase
        .from('gookie_bids')
        .insert({
          gookie_id: id,
          bidder_wallet: publicKey.toBase58(),
          bid_amount_rfrm: amount,
          transaction_signature: tx
        });

      if (bidError) throw bidError;

      setNotification({ type: 'success', message: `Bid placed on-chain! Tx: ${tx.slice(0, 8)}...` });
      setBidAmount('');
      
      await fetchGookieDetails();
      await fetchBids();

    } catch (error: any) {
      console.error('Bidding error:', error);
      setNotification({ type: 'error', message: error.message || 'Failed to place bid.' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 4000);
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

  const currentBid = gookie.winning_bid_rfrm > 0 ? gookie.winning_bid_rfrm : gookie.starting_bid_rfrm;
  const minimumBid = gookie.winning_bid_rfrm > 0 
    ? gookie.winning_bid_rfrm + MIN_BID_INCREMENT_RFRM 
    : gookie.starting_bid_rfrm;

  // Derived states for conditional rendering
  const isAuctionEnded = isEnded;
  const isWinner = connected && publicKey && gookie.winner_wallet === publicKey.toBase58();
  const hasMarketActive = gookie.status === 'market_active' || gookie.status === 'market_closed' || gookie.status === 'completed';

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
                    gookie.status === 'auction'
                      ? 'bg-orange-500/90 border-orange-400 text-white shadow-xl shadow-orange-500/30'
                      : gookie.status === 'market_active'
                      ? 'bg-green-500/90 border-green-400 text-white'
                      : 'bg-gray-900/80 border-gray-700 text-white'
                  }`}>
                    {gookie.status.toUpperCase().replace('_', ' ')}
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
                            {bid.bidder_wallet.slice(0, 4)}...{bid.bidder_wallet.slice(-4)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {bid.created_at ? new Date(bid.created_at).toLocaleString() : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-lg ${index === 0 ? 'text-orange-500' : 'text-gray-900 dark:text-white'}`}>
                          {bid.bid_amount_rfrm} RFRM
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
                  {gookie.winning_bid_rfrm > 0 ? 'Current Highest Bid' : 'Starting Bid'}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                    {currentBid}
                  </span>
                  <span className="text-xl font-bold text-gray-500 dark:text-gray-400">RFRM</span>
                </div>
                
                {gookie.winner_wallet && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                      <Trophy size={14} />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Highest Bidder</p>
                      <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                        {gookie.winner_wallet.slice(0, 4)}...{gookie.winner_wallet.slice(-4)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <hr className="border-gray-100 dark:border-gray-800 mb-8" />

              {/* Notification */}
              {notification && (
                <div className={`p-4 rounded-xl flex items-start gap-3 mb-6 ${
                  notification.type === 'success' 
                    ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' 
                    : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                } border`}>
                  {notification.type === 'success' ? <CheckCircle size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
                  <span className="text-sm font-medium">{notification.message}</span>
                </div>
              )}

              {/* Conditional Rendering: Auction Active / Ended / Winner Setup */}
              {isAuctionEnded ? (
                isWinner && !hasMarketActive ? (
                  <div className="space-y-6">
                    {/* Winner Congratulations Header */}
                    <div className="text-center p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-2xl border-2 border-yellow-200 dark:border-yellow-800">
                      <Trophy size={48} className="mx-auto mb-2 text-yellow-500" />
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">🎉 Congratulations, Winner!</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">You won the auction! Set up your market below.</p>
                    </div>

                    {/* Market Type Selection */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        Market Type *
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setMarketType('binary')}
                          className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                            marketType === 'binary'
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          Binary (Yes/No)
                        </button>
                        <button
                          onClick={() => setMarketType('multiple')}
                          className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
                            marketType === 'multiple'
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          Multiple Options
                        </button>
                      </div>
                    </div>

                    {/* Market Title */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        Market Title *
                      </label>
                      <input
                        type="text"
                        value={marketTitle}
                        onChange={(e) => setMarketTitle(e.target.value)}
                        placeholder="e.g., Who will win the championship?"
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-orange-500 outline-none"
                      />
                    </div>

                    {/* Market Description */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        Description (Optional)
                      </label>
                      <textarea
                        value={marketDescription}
                        onChange={(e) => setMarketDescription(e.target.value)}
                        placeholder="Provide context for your market..."
                        rows={3}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                      />
                    </div>

                    {/* Market End Date */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                        <Calendar size={16} /> Market End Date *
                      </label>
                      <input
                        type="date"
                        value={marketEndDate}
                        onChange={(e) => setMarketEndDate(e.target.value)}
                        min={marketEndDate}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-orange-500 outline-none"
                      />
                    </div>

                    {/* Market Options (only for multiple type) */}
                    {marketType === 'multiple' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                        Market Options (2-6) *
                      </label>
                      <div className="space-y-2">
                        {marketOptions.map((option, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateOption(index, e.target.value)}
                              placeholder={`Option ${index + 1}`}
                              className="flex-1 px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-orange-500 outline-none"
                            />
                            {marketOptions.length > 2 && (
                              <button
                                onClick={() => removeOption(index)}
                                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {marketOptions.length < 6 && (
                        <button
                          onClick={addOption}
                          className="mt-3 w-full py-3 bg-gray-50 dark:bg-[#0B0C10] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:border-orange-500 hover:text-orange-500 dark:hover:border-orange-500 dark:hover:text-orange-400 transition font-medium flex items-center justify-center gap-2"
                        >
                          <Plus size={18} /> Add Option
                        </button>
                      )}
                    </div>
                    )}

                    {/* Deploy Button */}
                    <button
                      onClick={handleDeployMarket}
                      disabled={isDeployingMarket || !marketTitle.trim() || !marketEndDate || (marketType === 'multiple' && marketOptions.filter(o => o.trim()).length < 2)}
                      className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                    >
                      {isDeployingMarket ? (
                        <>
                          <Loader2 size={24} className="animate-spin" /> Publishing...
                        </>
                      ) : (
                        <>
                          <Sparkles size={20} /> Publish Market
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <Trophy size={40} className="mx-auto mb-3 text-gray-400" />
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      Auction Closed
                    </h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {gookie.winner_wallet 
                        ? `Winner: ${gookie.winner_wallet.slice(0,4)}...${gookie.winner_wallet.slice(-4)}`
                        : 'Ended with no bids.'}
                    </p>
                    {hasMarketActive && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Market is {gookie.status === 'market_active' ? 'active' : gookie.status.replace('_', ' ')}
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {!connected ? (
                    <div className="text-center space-y-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Connect your wallet to place a bid</p>
                      <div className="flex justify-center">
                        <WalletMultiButton className="!bg-orange-500 hover:!bg-orange-600 !rounded-xl !h-12 !px-8 !font-bold !transition-colors w-full flex justify-center" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                          Your Bid Amount (RFRM)
                        </label>
                        
                        {/* Minimum Bid Info */}
                        <div className="mb-3 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-200 dark:border-orange-900/30">
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                            Minimum bid: <span className="font-bold">{minimumBid} RFRM</span>
                            <span className="text-xs ml-2 opacity-75">({MIN_BID_INCREMENT_RFRM} RFRM increment)</span>
                          </p>
                        </div>

                        <div className="relative">
                          <input
                            type="number"
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            placeholder={minimumBid.toString()}
                            step="10"
                            min={minimumBid}
                            className="w-full pl-6 pr-20 py-4 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white font-bold text-xl focus:ring-2 focus:ring-orange-500 outline-none transition-shadow"
                          />
                          <div className="absolute inset-y-0 right-6 flex items-center pointer-events-none text-gray-500 font-bold">
                            RFRM
                          </div>
                        </div>
                      </div>

                      {/* Validation Warnings */}
                      {bidAmount && parseFloat(bidAmount) < minimumBid && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
                          <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0" />
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">
                            Bid must be at least {minimumBid} RFRM
                          </span>
                        </div>
                      )}

                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-center gap-2">
                        <AlertCircle size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                          On-chain bidding with automatic refunds. Anti-snipe protection active.
                        </span>
                      </div>

                      <button
                        onClick={handlePlaceBid}
                        disabled={
                          isSubmitting || 
                          !bidAmount || 
                          parseFloat(bidAmount || '0') < minimumBid
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
