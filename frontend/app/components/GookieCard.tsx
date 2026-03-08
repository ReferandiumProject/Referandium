'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, Trophy, Image as ImageIcon } from 'lucide-react';
import { Gookie } from '../types';

export default function GookieCard({ gookie }: { gookie: Gookie }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(gookie.auction_end_time).getTime();
      const distance = end - now;

      if (distance < 0 || gookie.status !== 'auction') {
        setIsEnded(true);
        setTimeLeft('Ended');
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
      
      setTimeLeft(timeString);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [gookie.auction_end_time, gookie.status]);

  const currentBid = gookie.winning_bid_rfrm > 0 ? gookie.winning_bid_rfrm : gookie.starting_bid_rfrm;

  const getStatusColor = () => {
    const colors = {
      auction: 'bg-orange-500/80 border-orange-400 text-white shadow-lg shadow-orange-500/20',
      won: 'bg-blue-500/80 border-blue-400 text-white',
      market_active: 'bg-green-500/80 border-green-400 text-white',
      market_closed: 'bg-gray-900/60 border-gray-700 text-white',
      penalized: 'bg-red-500/80 border-red-400 text-white',
      completed: 'bg-purple-500/80 border-purple-400 text-white',
    }
    return colors[gookie.status] || colors.market_closed
  }

  return (
    <Link href={`/gookies/${gookie.id}`} className="block group h-full">
      <div className="bg-white dark:bg-[#181A20] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
        
        {/* Image Section */}
        <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
          {gookie.image_url ? (
            <img 
              src={gookie.image_url} 
              alt={gookie.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon size={48} className="text-gray-300 dark:text-gray-600" />
            </div>
          )}
          
          {/* Status Badge */}
          <div className="absolute top-3 right-3">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md border ${getStatusColor()}`}>
              {gookie.status === 'auction' ? 'LIVE' : gookie.status.toUpperCase().replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-4 flex flex-col flex-grow">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 line-clamp-1 group-hover:text-orange-500 transition-colors truncate">
            {gookie.title}
          </h3>
          
          <div className="mt-auto pt-3 flex items-end justify-between border-t border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                {gookie.winning_bid_rfrm > 0 ? 'Winning Bid' : 'Starting Bid'}
              </p>
              <p className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1">
                {currentBid} <span className="text-xs text-gray-500">RFRM</span>
              </p>
            </div>
            
            <div className="text-right">
              {isEnded && gookie.winner_wallet ? (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center justify-end gap-1">
                    <Trophy size={12} /> Winner
                  </p>
                  <p className="text-xs font-mono font-bold text-gray-900 dark:text-white">
                    {gookie.winner_wallet.slice(0, 4)}...{gookie.winner_wallet.slice(-4)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 flex items-center justify-end gap-1">
                    <Clock size={12} /> {isEnded ? 'Ended' : 'Ends in'}
                  </p>
                  <p className={`text-sm font-bold tabular-nums ${isEnded ? 'text-gray-500' : 'text-orange-500'}`}>
                    {timeLeft}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        
      </div>
    </Link>
  );
}
