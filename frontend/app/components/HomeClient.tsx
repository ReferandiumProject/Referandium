'use client';

import Link from 'next/link';
import { ArrowRight, Wallet, BarChart2, TrendingUp, ShieldCheck, Zap, Users } from 'lucide-react';
import MarketCard from './MarketCard';
import Footer from './Footer';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../context/LanguageContext';

interface HomeClientProps {
  markets: any[];
}

export default function HomeClient({ markets }: HomeClientProps) {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      
      {/* 1. NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">R</div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">Referandium</span>
            </div>

            {/* Menü Linkleri */}
            <div className="hidden md:flex space-x-8">
              <Link href="/markets" className="text-gray-500 hover:text-blue-600 font-medium transition">{t('markets')}</Link>
              <Link href="/admin" className="text-gray-500 hover:text-blue-600 font-medium transition">{t('admin')}</Link>
            </div>

            {/* Sağ Taraf */}
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <Link 
                href="/profile" 
                className="bg-gray-900 text-white px-5 py-2 rounded-full font-medium hover:bg-gray-800 transition flex items-center gap-2 text-sm shadow-lg shadow-gray-200"
              >
                <Users size={16} />
                {t('myProfile')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <div className="relative overflow-hidden bg-white">
        {/* Arka Plan Efektleri */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-50 via-indigo-50 to-white -z-10" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />

        <div className="max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* SOL SÜTUN: Video */}
            <div className="order-2 lg:order-1">
              <div className="max-w-md mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-blue-200/50 hover:shadow-blue-300/60 transition-shadow duration-500">
                <video
                  autoPlay
                  loop
                  controls
                  playsInline
                  className="w-full h-auto block"
                >
                  <source src="/hero-video.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>

            {/* SAĞ SÜTUN: İçerik */}
            <div className="order-1 lg:order-2 text-left">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-6 uppercase tracking-wider">
                {t('liveBadge')}
              </span>
              
              <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-6 leading-tight">
                {t('heroTitle1')} <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                  {t('heroTitle2')}
                </span>
              </h1>
              
              <p className="text-xl text-gray-500 mb-10 leading-relaxed max-w-xl">
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
                  className="px-8 py-4 bg-white text-gray-700 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center"
                >
                  {t('howItWorks')}
                </a>
              </div>

              {/* İstatistikler */}
              <div className="grid grid-cols-3 gap-6 mt-14 pt-8 border-t border-gray-200/60">
                <div>
                  <p className="text-3xl font-bold text-gray-900">1.2K+</p>
                  <p className="text-sm text-gray-500 mt-1">{t('policyShapers')}</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">$450K+</p>
                  <p className="text-sm text-gray-500 mt-1">{t('signalVolume')}</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">98%</p>
                  <p className="text-sm text-gray-500 mt-1">{t('consensusRate')}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 3. HOW IT WORKS */}
      <div id="how-it-works" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">{t('howItWorksTitle')}</h2>
            <p className="text-gray-500 mt-4">{t('howItWorksSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-gray-50 rounded-3xl border border-gray-100 hover:border-blue-200 transition group cursor-default">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition text-blue-600">
                <Wallet size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{t('step1Title')}</h3>
              <p className="text-gray-500 leading-relaxed">{t('step1Desc')}</p>
            </div>

            <div className="p-8 bg-gray-50 rounded-3xl border border-gray-100 hover:border-blue-200 transition group cursor-default">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition text-purple-600">
                <TrendingUp size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{t('step2Title')}</h3>
              <p className="text-gray-500 leading-relaxed">{t('step2Desc')}</p>
            </div>

            <div className="p-8 bg-gray-50 rounded-3xl border border-gray-100 hover:border-blue-200 transition group cursor-default">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition text-green-600">
                <ShieldCheck size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{t('step3Title')}</h3>
              <p className="text-gray-500 leading-relaxed">{t('step3Desc')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MARKET LISTING */}
      <div id="markets" className="max-w-7xl mx-auto px-4 py-20">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="text-yellow-500 fill-yellow-500" /> 
              {t('popularMarkets')}
            </h2>
            <p className="text-gray-500 mt-2">{t('popularMarketsDesc')}</p>
          </div>
          <Link href="/markets" className="text-blue-600 font-bold hover:underline hidden sm:block">
            {t('viewAllMarkets')}
          </Link>
        </div>

        {markets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {markets.map((market: any) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
            <BarChart2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">{t('noMarketsFound')}</h3>
            <p className="text-gray-500">{t('noMarketsDesc')}</p>
          </div>
        )}
        
        <div className="mt-8 text-center sm:hidden">
          <Link href="/markets" className="text-blue-600 font-bold hover:underline">
            {t('viewAllMarkets')}
          </Link>
        </div>
      </div>

      {/* 5. FOOTER */}
      <Footer />
    </div>
  );
}
