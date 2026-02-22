'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Wallet, BarChart2, TrendingUp, ShieldCheck, Zap, Users, VolumeX, Volume1, Volume2 } from 'lucide-react';
import MarketCard from './MarketCard';
import LanguageToggle from './LanguageToggle';
import ThemeSwitch from './ThemeSwitch';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';

interface HomeClientProps {
  markets: any[];
}

export default function HomeClient({ markets }: HomeClientProps) {
  const { t } = useLanguage();
  const { user } = useUser();
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    setIsMuted(val === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      if (isMuted) {
        const restored = volume > 0 ? volume : 0.5;
        videoRef.current.muted = false;
        videoRef.current.volume = restored;
        setVolume(restored);
        setIsMuted(false);
      } else {
        videoRef.current.muted = true;
        setIsMuted(true);
      }
    }
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] font-sans transition-colors">
      
      {/* HERO SECTION */}
      <div className="relative overflow-hidden bg-white dark:bg-gray-900">
        {/* Arka Plan Efektleri */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-50 via-indigo-50 to-white dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 -z-10" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />

        <div className="max-w-7xl mx-auto px-4 pt-12 pb-20 sm:px-6 lg:px-8 lg:pt-16 lg:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* SOL SÜTUN: Video */}
            <div className="order-2 lg:order-1">
              <div className="relative max-w-md mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-blue-200/50 hover:shadow-blue-300/60 transition-shadow duration-500">
                <video
                  ref={videoRef}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto block"
                >
                  <source src="/hero-video.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <div className="group absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm px-1.5 py-1.5 transition-all duration-300">
                  <button
                    onClick={toggleMute}
                    className="p-1 rounded-full text-white hover:text-white/80 transition flex-shrink-0"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    <VolumeIcon size={18} />
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover:w-20 md:group-hover:w-24 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer accent-white h-1 appearance-none bg-white/30 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* SAĞ SÜTUN: İçerik */}
            <div className="order-1 lg:order-2 text-left mt-0 pt-0">
              <span className="inline-block bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold px-3 py-1 rounded-full mb-6 uppercase tracking-wider">
                {t('liveBadge')}
              </span>
              
              <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6 leading-tight">
                {t('heroTitle1')} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                  {t('heroTitle2')}
                </span>
              </h1>
              
              <p className="text-xl text-gray-500 dark:text-gray-400 mb-10 leading-relaxed max-w-xl">
                {t('heroDescription')}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  href="/markets" 
                  className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
                >
                  {t('signalDemand')} <ArrowRight size={20} />
                </Link>
                <a 
                  href="#how-it-works" 
                  className="px-8 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center justify-center"
                >
                  {t('howItWorks')}
                </a>
              </div>

              {/* Blockquote */}
              <blockquote className="mt-10 pl-4 border-l-4 border-blue-500 dark:border-purple-500">
                <p className="text-base italic text-gray-500 dark:text-gray-400 leading-relaxed">
                  &ldquo;The best way to predict the future is to make it.&rdquo;
                </p>
                <cite className="block mt-1.5 text-sm not-italic font-medium text-gray-400 dark:text-gray-500">
                  — Peter Drucker
                </cite>
              </blockquote>

              {/* Interactive Box */}
              <div className="mt-5 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed flex flex-wrap items-center gap-1.5">
                  <span>The best way to predict the future is to</span>
                  {['Make', 'Create', 'Invent'].map((word) => (
                    <button
                      key={word}
                      onClick={() => setSelectedWord(word)}
                      className={`px-3 py-1 text-sm font-medium rounded-full border transition-all duration-200 ${
                        selectedWord === word
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200/50 dark:shadow-blue-900/50 scale-105'
                          : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      {word}
                    </button>
                  ))}
                  <span>it.</span>
                </p>
                {selectedWord && (
                  <p className="mt-2.5 text-xs text-blue-600 dark:text-blue-400 font-medium animate-fade-in">
                    You chose to <span className="font-bold">{selectedWord.toLowerCase()}</span> the future. That&apos;s the Referandium spirit. ✨
                  </p>
                )}
              </div>

              {/* İstatistikler */}
              <div className="grid grid-cols-3 gap-6 mt-10 pt-8 border-t border-gray-200/60 dark:border-gray-700/60">
                <div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">1.2K+</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('policyShapers')}</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">$450K+</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('signalVolume')}</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">98%</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('consensusRate')}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 3. HOW IT WORKS */}
      <div id="how-it-works" className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('howItWorksTitle')}</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-4">{t('howItWorksSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-500 transition group cursor-default">
              <div className="w-14 h-14 bg-white dark:bg-gray-700 rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition text-blue-600">
                <Wallet size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('step1Title')}</h3>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{t('step1Desc')}</p>
            </div>

            <div className="p-8 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-500 transition group cursor-default">
              <div className="w-14 h-14 bg-white dark:bg-gray-700 rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition text-purple-600">
                <TrendingUp size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('step2Title')}</h3>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{t('step2Desc')}</p>
            </div>

            <div className="p-8 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-500 transition group cursor-default">
              <div className="w-14 h-14 bg-white dark:bg-gray-700 rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition text-green-600">
                <ShieldCheck size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{t('step3Title')}</h3>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{t('step3Desc')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MARKET LISTING */}
      <div id="markets" className="max-w-7xl mx-auto px-4 py-20">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="text-yellow-500 fill-yellow-500" /> 
              {t('popularMarkets')}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">{t('popularMarketsDesc')}</p>
          </div>
          <Link href="/markets" className="text-blue-600 font-bold hover:underline hidden sm:block">
            {t('viewAllMarkets')}
          </Link>
        </div>

        {markets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market: any) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-300 dark:border-gray-600">
            <BarChart2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('noMarketsFound')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('noMarketsDesc')}</p>
          </div>
        )}
        
        <div className="mt-8 text-center sm:hidden">
          <Link href="/markets" className="text-blue-600 font-bold hover:underline">
            {t('viewAllMarkets')}
          </Link>
        </div>
      </div>
    </div>
  );
}
