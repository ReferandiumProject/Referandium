'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import GookieCard from '../components/GookieCard';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function GookiesPage() {
  const [gookies, setGookies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');

  useEffect(() => {
    fetchGookies();
  }, [statusFilter]);

  const fetchGookies = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('gookies')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setGookies(data || []);
    } catch (error) {
      console.error('Error fetching gookies:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredGookies = gookies.filter(gookie => 
    gookie.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (gookie.description && gookie.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B0C10]">
      {/* HEADER HERO */}
      <div className="bg-white dark:bg-[#181A20] border-b border-gray-100 dark:border-gray-800 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="inline-block p-3 bg-orange-100 dark:bg-orange-900/30 rounded-2xl mb-4">
            <span className="text-4xl">🍪</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-4 tracking-tight">
            Gookies <span className="text-orange-500">Auctions</span>
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto font-medium">
            Bid on exclusive Gookies. Highest bidder wins when the countdown ends.
          </p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        
        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          
          {/* Status Filters */}
          <div className="flex bg-white dark:bg-[#181A20] p-1.5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm w-full md:w-auto">
            {['all', 'active', 'closed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold capitalize transition-all ${
                  statusFilter === status
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search Gookies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#181A20] border border-gray-200 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={40} className="text-orange-500 animate-spin mb-4" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Loading auctions...</p>
          </div>
        ) : filteredGookies.length === 0 ? (
          /* Empty State */
          <div className="bg-white dark:bg-[#181A20] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl p-16 text-center shadow-sm">
            <div className="text-6xl mb-4 opacity-50">🍪</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Gookies Found</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              We couldn't find any auctions matching your criteria. Check back later for new exclusive drops!
            </p>
          </div>
        ) : (
          /* Gookies Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredGookies.map((gookie) => (
              <GookieCard key={gookie.id} gookie={gookie} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
