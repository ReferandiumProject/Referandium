'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { supabase } from '@/lib/supabaseClient';
import { User, History, Wallet, ArrowRight, BarChart3, Coins, Copy, Check, Save, Loader2, Trophy, Clock } from 'lucide-react';
import ThemeSwitch from '../components/ThemeSwitch';
import { useUser } from '../context/UserContext';

export default function ProfilePage() {
  const { publicKey, connected } = useWallet();
  const { user, refreshUser } = useUser();

  // Profile edit states
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Voting history states
  const [votes, setVotes] = useState<any[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'markets' | 'gookies'>('markets');

  // Gookies states
  const [ownedGookies, setOwnedGookies] = useState<any[]>([]);
  const [myBids, setMyBids] = useState<any[]>([]);
  const [gookiesLoading, setGookiesLoading] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync local state with user data
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setBio(user.bio || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  // Fetch voting history
  useEffect(() => {
    if (connected && publicKey) {
      fetchUserVotes();
      fetchUserGookies();
    } else {
      setVotes([]);
      setOwnedGookies([]);
      setMyBids([]);
    }
  }, [connected, publicKey]);

  const fetchUserVotes = async () => {
    if (!publicKey) return;
    setVotesLoading(true);
    const walletAddress = publicKey.toBase58();

    try {
      const { data: votesData, error: votesError } = await supabase
        .from('votes')
        .select('*')
        .eq('user_wallet', walletAddress)
        .order('created_at', { ascending: false });

      if (votesError || !votesData || votesData.length === 0) {
        setVotes([]);
        return;
      }

      const marketIds = [...new Set(votesData.map((v: any) => v.market_id))];
      const { data: marketsData } = await supabase
        .from('markets')
        .select('*')
        .in('id', marketIds);

      const merged = votesData.map((vote: any) => ({
        ...vote,
        markets: marketsData?.find((m: any) => m.id === vote.market_id) || null,
      }));
      setVotes(merged);
    } catch (error) {
      console.error('Error fetching votes:', error);
    } finally {
      setVotesLoading(false);
    }
  };

  const fetchUserGookies = async () => {
    if (!publicKey) return;
    setGookiesLoading(true);
    const walletAddress = publicKey.toBase58();

    try {
      // Fetch owned Gookies (won auctions)
      const { data: ownedData, error: ownedError } = await supabase
        .from('gookies')
        .select('*')
        .eq('highest_bidder_wallet', walletAddress)
        .eq('status', 'closed')
        .order('end_time', { ascending: false });

      if (!ownedError && ownedData) {
        setOwnedGookies(ownedData);
      }

      // Fetch all user bids
      const { data: bidsData, error: bidsError } = await supabase
        .from('gookie_bids')
        .select('*')
        .eq('user_wallet', walletAddress)
        .order('created_at', { ascending: false });

      if (!bidsError && bidsData) {
        // Fetch associated Gookies for the bids
        const gookieIds = [...new Set(bidsData.map((b: any) => b.gookie_id))];
        const { data: gookiesData } = await supabase
          .from('gookies')
          .select('*')
          .in('id', gookieIds);

        const mergedBids = bidsData.map((bid: any) => ({
          ...bid,
          gookie: gookiesData?.find((g: any) => g.id === bid.gookie_id) || null,
        }));
        setMyBids(mergedBids);
      }
    } catch (error) {
      console.error('Error fetching Gookies:', error);
    } finally {
      setGookiesLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from('users')
        .update({ username, bio })
        .eq('id', user.id);

      if (error) {
        setSaveMessage({ type: 'error', text: 'Failed to update profile: ' + error.message });
      } else {
        setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
        await refreshUser();
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  const copyWallet = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Calculate comprehensive user statistics
  const totalSpent = votes.reduce((acc, vote) => acc + (vote.amount_sol || 0), 0);
  const totalVotes = votes.length;
  const yesVotes = votes.filter(v => v.vote_direction === 'yes').length;
  const noVotes = votes.filter(v => v.vote_direction === 'no').length;
  const uniqueMarkets = new Set(votes.map(v => v.market_id)).size;
  const avgVoteAmount = totalVotes > 0 ? (totalSpent / totalVotes) : 0;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B0C10]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {!connected ? (
          /* ── Wallet Not Connected ── */
          <div className="bg-white dark:bg-gray-800 p-16 rounded-3xl shadow-lg text-center border border-gray-100 dark:border-gray-700 mt-8">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-8">
              <Wallet className="text-blue-600" size={44} />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Wallet Not Connected</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto text-lg">
              Connect your Solana wallet to view and edit your profile.
            </p>
            <WalletMultiButton className="!bg-gradient-to-r !from-blue-600 !to-indigo-600 hover:!from-blue-700 hover:!to-indigo-700 !rounded-xl !text-base !h-12 !px-8" />
          </div>
        ) : (
          <div className="space-y-8">

            {/* ── Profile Edit Card ── */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 sm:px-5 py-4">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                  <div className="p-1.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg text-white">
                    <User size={18} />
                  </div>
                  My Profile
                </h1>
                <WalletMultiButton className="!bg-gradient-to-r !from-blue-600 !to-indigo-600 hover:!from-blue-700 hover:!to-indigo-700 !rounded-xl !text-sm !h-9 !px-4" />
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-start gap-4">

                  {/* Avatar */}
                  <div className="flex-shrink-0 mx-auto sm:mx-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="w-24 h-24 rounded-2xl object-cover bg-gray-100 dark:bg-gray-700 ring-4 ring-gray-100 dark:ring-gray-700"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-4 ring-gray-100 dark:ring-gray-700">
                        <User size={40} className="text-white" />
                      </div>
                    )}
                  </div>

                  {/* Form Fields */}
                  <div className="flex-1 w-full space-y-3">
                    {/* Username */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={30}
                        placeholder="Enter your username"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>

                    {/* Bio */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Bio
                      </label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={160}
                        rows={2}
                        placeholder="Tell us about yourself..."
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">{bio.length}/160</p>
                    </div>

                    {/* Wallet Address */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Wallet Address
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={publicKey?.toBase58() || ''}
                          disabled
                          className="flex-1 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 font-mono text-sm cursor-not-allowed"
                        />
                        <button
                          onClick={copyWallet}
                          className="p-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition"
                          title="Copy address"
                        >
                          {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Save Button + Message */}
                    <div className="flex items-center gap-4 pt-1">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl transition text-sm"
                      >
                        {saving ? (
                          <><Loader2 size={16} className="animate-spin" /> Saving...</>
                        ) : (
                          <><Save size={16} /> Save Changes</>
                        )}
                      </button>
                      {saveMessage && (
                        <span className={`text-sm font-medium ${
                          saveMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {saveMessage.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Stats Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
                <div className="p-4 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl">
                  <BarChart3 size={28} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Votes</p>
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{totalVotes}</p>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-5">
                <div className="p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl">
                  <Coins size={28} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Volume</p>
                  <p className="text-3xl font-extrabold text-gray-900 dark:text-white">{totalSpent.toFixed(4)} <span className="text-lg font-bold text-gray-400">SOL</span></p>
                </div>
              </div>
            </div>

            {/* ── Activity Tabs ── */}
            <div>
              {/* Tab Navigation */}
              <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('markets')}
                  className={`pb-3 px-2 text-base font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'markets'
                      ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <BarChart3 size={18} />
                  My Signals (Markets)
                </button>
                <button
                  onClick={() => setActiveTab('gookies')}
                  className={`pb-3 px-2 text-base font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'gookies'
                      ? 'border-b-2 border-orange-500 text-orange-600 dark:text-orange-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <span className="text-lg">🍪</span>
                  My Gookies
                </button>
              </div>

              {/* Markets Tab Content */}
              {activeTab === 'markets' && (
                <>
              {votesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <span className="ml-3 text-gray-500 dark:text-gray-400">Loading your votes...</span>
                </div>
              ) : votes.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History className="text-gray-400" size={28} />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 mb-2 text-lg">No votes found yet.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Start voting on markets to see your history here.</p>
                  <Link href="/" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition text-sm">
                    Explore Markets <ArrowRight size={16} />
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {votes.map((vote) => (
                    <Link
                      href={vote.markets ? `/market/${vote.markets.id}` : '#'}
                      key={vote.id}
                      className="block group"
                    >
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                        <img
                          src={vote.markets?.image_url || 'https://placehold.co/100'}
                          alt="market"
                          className="w-14 h-14 rounded-xl object-cover bg-gray-100 dark:bg-gray-700 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition truncate">
                            {vote.markets?.question || 'Deleted Market'}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(vote.created_at).toLocaleDateString('en-US', {
                              year: 'numeric', month: 'short', day: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold tracking-wide ${
                            vote.vote_direction === 'yes'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}>
                            {vote.vote_direction === 'yes' ? 'YES' : 'NO'}
                          </span>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                            {vote.amount_sol} SOL
                          </span>
                          <ArrowRight size={18} className="text-gray-300 group-hover:text-blue-500 transition" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              </>
              )}

              {/* Gookies Tab Content */}
              {activeTab === 'gookies' && (
                <>
                  {gookiesLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={40} className="text-orange-500 animate-spin" />
                      <span className="ml-3 text-gray-500 dark:text-gray-400">Loading your Gookies...</span>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      
                      {/* Owned Gookies Section */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Trophy size={20} className="text-orange-500" />
                          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Owned Gookies</h3>
                          <span className="ml-auto bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1 rounded-full text-xs font-bold">
                            {ownedGookies.length}
                          </span>
                        </div>

                        {ownedGookies.length === 0 ? (
                          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                            <Trophy size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 mb-2">No Gookies owned yet</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Win auctions to collect exclusive Gookies!</p>
                            <Link href="/gookies" className="inline-flex items-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition text-sm">
                              Browse Auctions <ArrowRight size={16} />
                            </Link>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {ownedGookies.map((gookie) => (
                              <Link href={`/gookies/${gookie.id}`} key={gookie.id} className="group">
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                                  <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
                                    {gookie.image_url ? (
                                      <img 
                                        src={gookie.image_url} 
                                        alt={gookie.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-4xl">
                                        🍪
                                      </div>
                                    )}
                                    <div className="absolute top-2 right-2">
                                      <div className="bg-green-500 text-white px-2 py-1 rounded-lg text-xs font-bold shadow-lg">
                                        WON
                                      </div>
                                    </div>
                                  </div>
                                  <div className="p-3">
                                    <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate group-hover:text-orange-500 transition">
                                      {gookie.title}
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {gookie.current_highest_bid} SOL
                                    </p>
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bid History Section */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <History size={20} className="text-gray-400" />
                          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Bid History</h3>
                          <span className="ml-auto bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-bold">
                            {myBids.length} {myBids.length === 1 ? 'Bid' : 'Bids'}
                          </span>
                        </div>

                        {myBids.length === 0 ? (
                          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                            <History size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 mb-2">No bids placed yet</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500">Start bidding on Gookie auctions to see your history here.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {myBids.map((bid) => {
                              const gookie = bid.gookie;
                              const isWinning = gookie?.highest_bidder_wallet === publicKey?.toBase58();
                              const isEnded = gookie?.status === 'closed' || (gookie?.end_time && new Date(gookie.end_time) < new Date());
                              
                              return (
                                <Link
                                  href={gookie ? `/gookies/${gookie.id}` : '#'}
                                  key={bid.id}
                                  className="block group"
                                >
                                  <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                                      {gookie?.image_url ? (
                                        <img 
                                          src={gookie.image_url} 
                                          alt={gookie.title}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl">
                                          🍪
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-orange-500 transition truncate">
                                        {gookie?.title || 'Deleted Auction'}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1">
                                        <p className="text-xs text-gray-400">
                                          {new Date(bid.created_at).toLocaleDateString('en-US', {
                                            year: 'numeric', month: 'short', day: 'numeric',
                                          })}
                                        </p>
                                        {gookie?.end_time && (
                                          <>
                                            <span className="text-gray-300">•</span>
                                            <p className="text-xs text-gray-400 flex items-center gap-1">
                                              <Clock size={12} />
                                              {isEnded ? 'Ended' : 'Active'}
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                      <div className="text-right">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">My Bid</p>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                                          {bid.bid_amount} SOL
                                        </p>
                                      </div>
                                      {isEnded ? (
                                        isWinning ? (
                                          <div className="px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold flex items-center gap-1">
                                            <Trophy size={12} /> WON
                                          </div>
                                        ) : (
                                          <div className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-bold">
                                            ENDED
                                          </div>
                                        )
                                      ) : isWinning ? (
                                        <div className="px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold">
                                          WINNING
                                        </div>
                                      ) : (
                                        <div className="px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold">
                                          OUTBID
                                        </div>
                                      )}
                                      <ArrowRight size={18} className="text-gray-300 group-hover:text-orange-500 transition" />
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </>
              )}

            </div>

          </div>
        )}
      </div>
    </div>
  );
}