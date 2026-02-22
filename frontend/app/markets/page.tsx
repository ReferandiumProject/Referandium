'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Search, Zap, Loader2 } from 'lucide-react';
import MarketCard from '../components/MarketCard';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import { TranslationKey } from '../utils/translations';

// Supabase Bağlantısı
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const categoryKeys: Record<string, TranslationKey> = {
  'All': 'all',
  'Crypto': 'crypto',
  'Politics': 'politics',
  'Sports': 'sports',
  'Pop Culture': 'popCulture',
  'Business': 'business',
};

export default function MarketsPage() {
  const { t } = useLanguage();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Crypto', 'Politics', 'Sports', 'Pop Culture', 'Business'];

  // Verileri Çek
  useEffect(() => {
    fetchMarkets();
  }, []);

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('markets')
        .select('*, options:market_options(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMarkets(data || []);
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Arama + Kategori Filtresi
  const filteredMarkets = markets.filter(market => {
    const matchesSearch = 
      (market.title || market.question || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (market.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || market.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] font-sans transition-colors">
      
      {/* İÇERİK */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        
        {/* Başlık ve Arama */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="text-yellow-500 fill-yellow-500" />
              {t('allMarkets')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">{t('exploreMarkets')}</p>
          </div>

          {/* Arama Kutusu */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder={t('searchMarkets')} 
              className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Kategori Filtreleme Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t(categoryKeys[cat])}
            </button>
          ))}
        </div>

        {/* Yükleniyor veya Liste */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
            <p className="text-gray-500 dark:text-gray-400">{t('loadingMarkets')}</p>
          </div>
        ) : filteredMarkets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-300 dark:border-gray-600">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('noMarketsFound')}{selectedCategory !== 'All' ? ` — ${t(categoryKeys[selectedCategory])}` : ''}</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{selectedCategory !== 'All' ? t('tryDifferentCategory') : t('tryAdjustSearch')}</p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}