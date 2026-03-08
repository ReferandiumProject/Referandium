'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { ShieldAlert, Calendar, AlertTriangle, CheckCircle, XCircle, DollarSign, Eye, Loader2, Plus, Trophy, TrendingUp } from 'lucide-react';
import { Gookie, Market } from '../types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_WALLETS = [
  'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da',
  '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP',
];

export default function AdminPage() {
  const { connected, publicKey } = useWallet();
  const [activeTab, setActiveTab] = useState<'gookies' | 'markets'>('gookies');
  const [isAdmin, setIsAdmin] = useState(false);
  const [gookies, setGookies] = useState<Gookie[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [gookieForm, setGookieForm] = useState({
    title: '',
    description: '',
    image_url: '',
    starting_bid_rfrm: '100',
    auction_end_time: '',
  });

  const [slashModal, setSlashModal] = useState<{ gookieId: string, gookieName: string } | null>(null);
  const [slashReason, setSlashReason] = useState('');

  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toBase58();
      setIsAdmin(ADMIN_WALLETS.includes(walletAddress));
    } else {
      setIsAdmin(false);
    }
  }, [connected, publicKey]);

  useEffect(() => {
    if (isAdmin) {
      if (activeTab === 'gookies') {
        fetchGookies();
      } else {
        fetchMarkets();
      }
    }
  }, [activeTab, isAdmin]);

  const fetchGookies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('gookies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGookies((data || []) as Gookie[]);
    } catch (error) {
      console.error('Error fetching gookies:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMarkets((data || []) as Market[]);
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !publicKey) return;

    try {
      setIsSubmitting(true);
      const { error } = await supabase.from('gookies').insert({
        title: gookieForm.title,
        description: gookieForm.description || null,
        image_url: gookieForm.image_url || null,
        starting_bid_rfrm: parseFloat(gookieForm.starting_bid_rfrm),
        auction_end_time: new Date(gookieForm.auction_end_time).toISOString(),
        created_by_wallet: publicKey.toBase58(),
        status: 'auction',
      });
      if (error) throw error;
      setNotification({ type: 'success', message: 'Gookie auction created successfully!' });
      setGookieForm({ title: '', description: '', image_url: '', starting_bid_rfrm: '100', auction_end_time: '' });
      fetchGookies();
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to create gookie' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleSlashGookie = async () => {
    if (!slashModal || !slashReason.trim()) return;

    try {
      const gookie = gookies.find(g => g.id === slashModal.gookieId);
      if (!gookie) return;

      const penaltyAmount = gookie.rfrm_locked_amount;

      await supabase.from('gookie_penalties').insert({
        gookie_id: slashModal.gookieId,
        gookie_wallet: gookie.winner_wallet || '',
        penalty_type: 'platform_seizure',
        original_locked_rfrm: gookie.rfrm_locked_amount,
        penalty_amount_rfrm: penaltyAmount,
        returned_amount_rfrm: 0,
        reason: slashReason,
        executed_by_wallet: publicKey!.toBase58(),
      });

      await supabase.from('gookies').update({
        status: 'penalized',
        is_slashed: true,
        slash_amount: penaltyAmount,
        slash_reason: slashReason,
        slash_date: new Date().toISOString(),
      }).eq('id', slashModal.gookieId);

      setNotification({ type: 'success', message: 'Gookie slashed successfully' });
      setSlashModal(null);
      setSlashReason('');
      fetchGookies();
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to slash gookie' });
    } finally {
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleCloseMarketEarly = async (marketId: string) => {
    if (!confirm('Close this market early? This will end signaling immediately.')) return;

    try {
      await supabase.from('markets').update({ status: 'closed' }).eq('id', marketId);
      const market = markets.find(m => m.id === marketId);
      if (market?.gookie_id) {
        await supabase.from('gookies').update({ status: 'market_closed' }).eq('id', market.gookie_id);
      }
      setNotification({ type: 'success', message: 'Market closed successfully' });
      fetchMarkets();
      fetchGookies();
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to close market' });
    } finally {
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleApproveFee = async (gookieId: string) => {
    if (!confirm('Approve fee payment for this gookie?')) return;
    try {
      await supabase.from('gookies').update({ fee_paid: true }).eq('id', gookieId);
      setNotification({ type: 'success', message: 'Fee payment approved' });
      fetchGookies();
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to approve fee' });
    } finally {
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleWithholdFee = async (gookieId: string) => {
    const reason = prompt('Enter reason for withholding fee:');
    if (!reason) return;
    try {
      await supabase.from('gookies').update({ fee_paid: false, slash_reason: `Fee withheld: ${reason}` }).eq('id', gookieId);
      setNotification({ type: 'success', message: 'Fee withheld' });
      fetchGookies();
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to withhold fee' });
    } finally {
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      auction: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      won: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      market_active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      market_closed: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
      penalized: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
    return colors[status as keyof typeof colors] || colors.market_closed;
  };

  if (loading && !connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={48} />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <ShieldAlert size={64} className="text-gray-400 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Admin Access Required</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Connect your wallet to access the admin panel</p>
        <WalletMultiButton className="!bg-orange-500 !rounded-xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <XCircle size={64} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Your wallet is not authorized to access the admin panel</p>
        <p className="text-sm text-gray-400 font-mono">{publicKey?.toBase58()}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B0C10] pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="text-orange-500" size={32} />
            Admin Panel
          </h1>
          <WalletMultiButton className="!bg-gray-900 dark:!bg-white !rounded-xl" />
        </div>

        {/* Notification */}
        {notification && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            notification.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
              : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
          }`}>
            {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            <span className="font-medium">{notification.message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('gookies')}
            className={`pb-4 px-4 text-lg font-bold transition-colors ${
              activeTab === 'gookies'
                ? 'border-b-2 border-orange-500 text-orange-600 dark:text-orange-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            🍪 Gookies
          </button>
          <button
            onClick={() => setActiveTab('markets')}
            className={`pb-4 px-4 text-lg font-bold transition-colors ${
              activeTab === 'markets'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            📊 Markets
          </button>
        </div>

        {/* Content */}
        {activeTab === 'gookies' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Gookie Creation Form */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sticky top-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <Plus size={20} className="text-orange-500" />
                  Create Gookie Auction
                </h2>
                
                <form onSubmit={handleCreateGookie} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Title *</label>
                    <input
                      type="text"
                      required
                      value={gookieForm.title}
                      onChange={(e) => setGookieForm({ ...gookieForm, title: e.target.value })}
                      placeholder="e.g., Rare Gookie #001"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                    <textarea
                      rows={3}
                      value={gookieForm.description}
                      onChange={(e) => setGookieForm({ ...gookieForm, description: e.target.value })}
                      placeholder="Auction details..."
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Image URL</label>
                    <input
                      type="url"
                      value={gookieForm.image_url}
                      onChange={(e) => setGookieForm({ ...gookieForm, image_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Starting Bid (RFRM) *</label>
                    <input
                      type="number"
                      required
                      min="100"
                      step="10"
                      value={gookieForm.starting_bid_rfrm}
                      onChange={(e) => setGookieForm({ ...gookieForm, starting_bid_rfrm: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <Calendar size={16} /> Auction End Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={gookieForm.auction_end_time}
                      onChange={(e) => setGookieForm({ ...gookieForm, auction_end_time: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <><Loader2 size={20} className="animate-spin" /> Creating...</>
                    ) : (
                      <><Plus size={20} /> Create Auction</>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Gookies Table */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Trophy className="text-orange-500" size={24} />
                    Gookie Management
                    <span className="ml-auto text-sm font-normal text-gray-500">{gookies.length} total</span>
                  </h2>
                </div>

                {loading ? (
                  <div className="p-12 text-center">
                    <Loader2 className="animate-spin text-orange-500 mx-auto mb-4" size={32} />
                    <p className="text-gray-500 dark:text-gray-400">Loading gookies...</p>
                  </div>
                ) : gookies.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                    No gookies found. Create one to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Title</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Start Bid</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Win Bid</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Winner</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">End Time</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {gookies.map((gookie) => (
                          <tr key={gookie.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4">
                              <Link href={`/gookies/${gookie.id}`} className="font-medium text-gray-900 dark:text-white hover:text-orange-500">
                                {gookie.title}
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusBadge(gookie.status)}`}>
                                {gookie.status.toUpperCase().replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                              {gookie.starting_bid_rfrm} RFRM
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                              {gookie.winning_bid_rfrm || 0} RFRM
                            </td>
                            <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
                              {gookie.winner_wallet ? `${gookie.winner_wallet.slice(0, 4)}...${gookie.winner_wallet.slice(-4)}` : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                              {new Date(gookie.auction_end_time).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {gookie.status === 'market_active' && (
                                  <button
                                    onClick={() => {
                                      const market = markets.find(m => m.gookie_id === gookie.id);
                                      if (market) handleCloseMarketEarly(market.id);
                                    }}
                                    className="px-3 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-lg text-xs font-bold hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition"
                                    title="Close Market Early"
                                  >
                                    Close
                                  </button>
                                )}
                                {gookie.status === 'market_closed' && !gookie.fee_paid && (
                                  <>
                                    <button
                                      onClick={() => handleApproveFee(gookie.id)}
                                      className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg text-xs font-bold hover:bg-green-200 dark:hover:bg-green-900/50 transition"
                                      title="Approve Fee"
                                    >
                                      Approve Fee
                                    </button>
                                    <button
                                      onClick={() => handleWithholdFee(gookie.id)}
                                      className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                      title="Withhold Fee"
                                    >
                                      Withhold
                                    </button>
                                  </>
                                )}
                                {!gookie.is_slashed && gookie.status !== 'penalized' && (
                                  <button
                                    onClick={() => setSlashModal({ gookieId: gookie.id, gookieName: gookie.title })}
                                    className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                    title="Slash Gookie"
                                  >
                                    Slash
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Markets Tab */
          <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="text-blue-500" size={24} />
                Market Management
                <span className="ml-auto text-sm font-normal text-gray-500">{markets.length} total</span>
              </h2>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="animate-spin text-blue-500 mx-auto mb-4" size={32} />
                <p className="text-gray-500 dark:text-gray-400">Loading markets...</p>
              </div>
            ) : markets.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                No markets found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Gookie</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Signals</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">SOL Locked</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">End Time</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {markets.map((market) => (
                      <tr key={market.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-4">
                          <Link href={`/market/${market.id}`} className="font-medium text-gray-900 dark:text-white hover:text-blue-500">
                            {market.title}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{market.market_type}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            market.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            market.status === 'closed' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {market.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
                          {market.gookie_wallet ? `${market.gookie_wallet.slice(0, 4)}...${market.gookie_wallet.slice(-4)}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                          {market.total_signals}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                          {market.total_sol_locked.toFixed(2)} SOL
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(market.end_time).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/market/${market.id}`}
                              className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition flex items-center gap-1"
                            >
                              <Eye size={14} /> View
                            </Link>
                            {market.status === 'active' && (
                              <button
                                onClick={() => handleCloseMarketEarly(market.id)}
                                className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                              >
                                Close Early
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slash Modal */}
      {slashModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#181A20] rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-800">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={24} />
              Slash Gookie
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You are about to slash <span className="font-bold text-gray-900 dark:text-white">{slashModal.gookieName}</span>.
              This will seize all locked RFRM and mark the gookie as penalized.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reason for Slashing *</label>
              <textarea
                rows={3}
                required
                value={slashReason}
                onChange={(e) => setSlashReason(e.target.value)}
                placeholder="Explain why this gookie is being slashed..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0B0C10] border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setSlashModal(null); setSlashReason(''); }}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSlashGookie}
                disabled={!slashReason.trim()}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Slash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
