'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { usePrivy } from '@privy-io/react-auth';
import { useUser } from '../context/UserContext';
import {
  GraduationCap,
  Lock,
  Unlock,
  Clock,
  Coins,
  Play,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Plus,
} from 'lucide-react';
import { getRFRMPrice, calculateRFRMForUSD } from '../utils/rfrmPrice';
import {
  getUserSubscription,
  lockRFRM,
  extendSubscription,
  unlockRFRM,
  initializePlatform,
  UserSubscriptionData,
} from '../utils/subscriptionContract';

const USD_PER_MONTH = 25;
const ADMIN_WALLET = '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP';

const MONTH_OPTIONS = [1, 2, 3, 6];

const YOUTUBE_CONTENT = [
  {
    title: 'Introduction to Blockchain',
    url: 'https://www.youtube.com/watch?v=SSo_EIwHSd4',
    description: 'Learn the fundamentals of blockchain technology and how it works.',
    thumbnail: 'https://img.youtube.com/vi/SSo_EIwHSd4/mqdefault.jpg',
  },
  {
    title: 'What is Solana?',
    url: 'https://www.youtube.com/watch?v=1jzROE6EhxM',
    description: 'Understand what makes Solana unique and why it matters.',
    thumbnail: 'https://img.youtube.com/vi/1jzROE6EhxM/mqdefault.jpg',
  },
  {
    title: 'DeFi Explained',
    url: 'https://www.youtube.com/watch?v=17QRFlml4pA',
    description: 'A deep dive into decentralized finance protocols and yield strategies.',
    thumbnail: 'https://img.youtube.com/vi/17QRFlml4pA/mqdefault.jpg',
  },
  {
    title: 'How to Use a Crypto Wallet',
    url: 'https://www.youtube.com/watch?v=GNPz-Dv5BjM',
    description: 'Step-by-step guide to setting up and using Phantom wallet.',
    thumbnail: 'https://img.youtube.com/vi/GNPz-Dv5BjM/mqdefault.jpg',
  },
  {
    title: 'Understanding Tokenomics',
    url: 'https://www.youtube.com/watch?v=NOjST7nyZBo',
    description: 'Learn how token economics work and what drives token value.',
    thumbnail: 'https://img.youtube.com/vi/NOjST7nyZBo/mqdefault.jpg',
  },
  {
    title: 'NFTs and Digital Ownership',
    url: 'https://www.youtube.com/watch?v=Xdkkux6OxfM',
    description: 'Explore how NFTs enable true digital ownership on-chain.',
    thumbnail: 'https://img.youtube.com/vi/Xdkkux6OxfM/mqdefault.jpg',
  },
];

export default function LearningPage() {
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();
  const { authenticated } = useUser();
  const { login } = usePrivy();

  const [subscription, setSubscription] = useState<UserSubscriptionData | null>(null);
  const [rfrmPrice, setRfrmPrice] = useState<number>(0);
  const [selectedMonths, setSelectedMonths] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isExpired = subscription
    ? Date.now() / 1000 >= subscription.subscriptionExpiry.toNumber()
    : false;

  const isSubscribed = subscription?.isActive && !isExpired;

  const rfrmRequired = rfrmPrice > 0 
    ? calculateRFRMForUSD(USD_PER_MONTH * selectedMonths, rfrmPrice)
    : 1000 * selectedMonths;

  const fetchPrice = useCallback(async () => {
    setPriceLoading(true);
    try {
      const price = await getRFRMPrice();
      setRfrmPrice(price);
    } catch {
      console.error('Failed to fetch RFRM price');
    } finally {
      setPriceLoading(false);
    }
  }, []);

  const fetchSubscription = useCallback(async () => {
    if (!publicKey || !connection) return;
    setSubLoading(true);
    try {
      const data = await getUserSubscription(publicKey, connection);
      setSubscription(data);
    } catch {
      console.error('Failed to fetch subscription');
    } finally {
      setSubLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  useEffect(() => {
    if (authenticated && publicKey) {
      fetchSubscription();
    } else {
      setSubscription(null);
    }
  }, [authenticated, publicKey, fetchSubscription]);

  const handleLockRFRM = async () => {
    if (!wallet || !publicKey || !connection || rfrmRequired <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const rfrmAmountRaw = Math.ceil(rfrmRequired * 1e9);
      const tx = await lockRFRM(wallet as any, publicKey, connection, rfrmAmountRaw, selectedMonths);
      setTxStatus({ type: 'success', message: `Subscription activated! Tx: ${tx.slice(0, 16)}...` });
      await fetchSubscription();
    } catch (err: any) {
      console.error('Lock RFRM error:', err);
      setTxStatus({ type: 'error', message: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!wallet || !publicKey || !connection || rfrmRequired <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const rfrmAmountRaw = Math.ceil(rfrmRequired * 1e9);
      const tx = await extendSubscription(wallet as any, publicKey, connection, rfrmAmountRaw, selectedMonths);
      setTxStatus({ type: 'success', message: `Subscription extended! Tx: ${tx.slice(0, 16)}...` });
      await fetchSubscription();
    } catch (err: any) {
      console.error('Extend error:', err);
      setTxStatus({ type: 'error', message: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!wallet || !publicKey || !connection) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const tx = await unlockRFRM(wallet as any, publicKey, connection);
      setTxStatus({ type: 'success', message: `RFRM unlocked! Tx: ${tx.slice(0, 16)}...` });
      await fetchSubscription();
    } catch (err: any) {
      console.error('Unlock error:', err);
      setTxStatus({ type: 'error', message: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleInitializePlatform = async () => {
    if (!wallet || !publicKey || !connection) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const tx = await initializePlatform(wallet as any, publicKey, connection);
      setTxStatus({ type: 'success', message: `Platform initialized! Tx: ${tx.slice(0, 16)}...` });
    } catch (err: any) {
      console.error('Initialize platform error:', err);
      setTxStatus({ type: 'error', message: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = publicKey?.toBase58() === ADMIN_WALLET && authenticated;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
          <GraduationCap size={16} />
          Learning Hub
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-3">
          Learn Crypto with Referandium
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Lock RFRM tokens to access exclusive learning content. Videos, live sessions, and expert insights — all for ${USD_PER_MONTH}/month.
        </p>
      </div>

      {/* Not signed in */}
      {!authenticated && (
        <div className="max-w-md mx-auto text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <Lock size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sign In</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Sign in to subscribe and access learning content.
          </p>
          <div className="flex justify-center">
            <button
              onClick={() => login()}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-6 py-3 transition"
            >
              Sign In
            </button>
          </div>
        </div>
      )}

      {/* Signed in but not subscribed */}
      {authenticated && !isSubscribed && (
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Subscription Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Subscribe</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Lock RFRM tokens to get access</p>

            {/* RFRM Price */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">RFRM Price</span>
                <button onClick={fetchPrice} disabled={priceLoading} className="text-purple-600 hover:text-purple-700 dark:text-purple-400">
                  <RefreshCw size={14} className={priceLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {priceLoading ? (
                <div className="h-6 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-gray-900 dark:text-white">${rfrmPrice.toFixed(6)}</p>
              )}
            </div>

            {/* Month Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Duration</label>
              <div className="grid grid-cols-4 gap-2">
                {MONTH_OPTIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonths(m)}
                    className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                      selectedMonths === m
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {m} {m === 1 ? 'mo' : 'mo'}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Summary */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Cost</span>
                <span className="font-semibold text-gray-900 dark:text-white">${USD_PER_MONTH * selectedMonths}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">RFRM Required</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400">
                  {rfrmPrice > 0 ? rfrmRequired.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `${1000 * selectedMonths} (test)`} RFRM
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Duration</span>
                <span className="font-semibold text-gray-900 dark:text-white">{selectedMonths} month{selectedMonths > 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Lock Button */}
            <button
              onClick={handleLockRFRM}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Lock size={18} />
              )}
              {loading ? 'Processing...' : 'Lock & Subscribe'}
            </button>

            {/* Tx Status */}
            {txStatus && (
              <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
                txStatus.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}>
                {txStatus.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
                <span className="break-all">{txStatus.message}</span>
              </div>
            )}
          </div>

          {/* What's Included */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">What&apos;s Included</h2>
            <div className="space-y-4">
              {[
                { icon: Play, title: 'Video Library', desc: 'Access to all recorded lessons and tutorials' },
                { icon: GraduationCap, title: 'Expert Insights', desc: 'Learn from experienced crypto educators' },
                { icon: Coins, title: 'Token Locking', desc: 'Your RFRM is returned when subscription ends' },
                { icon: Clock, title: 'Flexible Plans', desc: 'Subscribe for 1 to 6 months at a time' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                    <Icon size={20} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Locked Content Preview */}
            <div className="mt-6 relative rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 gap-2 opacity-30 blur-[2px]">
                {YOUTUBE_CONTENT.slice(0, 4).map((video) => (
                  <div key={video.title} className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                    <img src={video.thumbnail} alt="" className="w-full aspect-video object-cover" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/90 dark:bg-gray-800/90 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2">
                  <Lock size={20} className="text-purple-600" />
                  <span className="font-bold text-gray-900 dark:text-white">Subscribe to unlock</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscribed */}
      {authenticated && isSubscribed && subscription && (
        <>
          {/* Subscription Status Bar */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 mb-8 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Active Subscription</h2>
                  <p className="text-purple-200 text-sm">
                    Expires {(() => { const d = new Date(subscription.subscriptionExpiry.toNumber() * 1000); return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`; })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold">{(subscription.lockedRfrm.toNumber() / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  <p className="text-purple-200 text-xs">RFRM Locked</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{subscription.monthsPaid}</p>
                  <p className="text-purple-200 text-xs">Months Paid</p>
                </div>
              </div>
            </div>
          </div>

          {/* Extend / Unlock Row */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {/* Extend */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Plus size={18} className="text-purple-600" /> Extend Subscription
              </h3>
              <div className="flex gap-2 mb-3">
                {MONTH_OPTIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonths(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                      selectedMonths === m
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    +{m}mo
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Cost: <span className="font-semibold text-purple-600">{rfrmPrice > 0 ? rfrmRequired.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `${1000 * selectedMonths} (test)`} RFRM</span> (${USD_PER_MONTH * selectedMonths})
              </p>
              <button
                onClick={handleExtend}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                Extend
              </button>
            </div>

            {/* Unlock */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Unlock size={18} className="text-green-600" /> Unlock RFRM
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                You can unlock your RFRM tokens after your subscription expires. Your locked amount of{' '}
                <span className="font-semibold">{(subscription.lockedRfrm.toNumber() / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} RFRM</span> will be returned to your wallet.
              </p>
              <button
                onClick={handleUnlock}
                disabled={loading || !isExpired}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Unlock size={16} />}
                {isExpired ? 'Unlock RFRM' : 'Subscription Active'}
              </button>
              {!isExpired && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Available after {(() => { const d = new Date(subscription.subscriptionExpiry.toNumber() * 1000); return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`; })()}
                </p>
              )}
            </div>
          </div>

          {/* Tx Status */}
          {txStatus && (
            <div className={`mb-6 flex items-start gap-2 p-3 rounded-lg text-sm ${
              txStatus.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {txStatus.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
              <span className="break-all">{txStatus.message}</span>
            </div>
          )}

          {/* Video Content Grid */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Play size={24} className="text-purple-600" /> Learning Content
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {YOUTUBE_CONTENT.map((video) => (
                <a
                  key={video.title}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition"
                >
                  <div className="relative">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full aspect-video object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Play size={20} className="text-purple-600 ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition flex items-center gap-1.5">
                      {video.title}
                      <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition" />
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{video.description}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Signed in but subscription expired */}
      {authenticated && subscription && !subscription.isActive && (
        <div className="max-w-md mx-auto text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
          <Clock size={48} className="mx-auto text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Subscription Ended</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Your subscription has ended. Subscribe again to access learning content.
          </p>
          {subscription.lockedRfrm.toNumber() > 0 && (
            <button
              onClick={handleUnlock}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 mb-4"
            >
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <Unlock size={18} />}
              Unlock {(subscription.lockedRfrm.toNumber() / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} RFRM
            </button>
          )}
        </div>
      )}

      {/* Loading subscription */}
      {authenticated && subLoading && !subscription && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={32} className="animate-spin text-purple-600" />
        </div>
      )}

      {/* Admin Only: Initialize Platform */}
      {isAdmin && (
        <div className="mt-8 text-center">
          <button
            onClick={handleInitializePlatform}
            disabled={loading}
            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition text-sm"
          >
            Init Platform (Admin Only)
          </button>
        </div>
      )}
    </div>
  );
}
