'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import { Market } from '../types'

interface MarketCardProps {
  market: Market
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
};

export default function MarketCard({ market }: MarketCardProps) {
  const totalSignals = Number(market.total_signals) || 0;
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (!market.gookie_wallet) return;
    supabase
      .from('gookies')
      .select('is_verified')
      .eq('winner_wallet', market.gookie_wallet)
      .eq('is_verified', true)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setIsVerified(true);
      });
  }, [market.gookie_wallet]);

  return (
    <Link href={`/market/${market.id}`} className="block no-underline group">
      <div className="bg-white border border-[#e1e2ed] rounded-xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)] transition-shadow hover:shadow-[0_4px_12px_rgba(15,23,42,0.12)] cursor-pointer h-full flex flex-col">

        {/* Badges */}
        <div className="flex gap-2 mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#2563eb]/5 text-[#2563eb] text-[12px] font-semibold tracking-[0.05em]">
            {market.category || 'General'}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold tracking-[0.05em] capitalize ${
            market.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' :
            market.status === 'closed' ? 'bg-[#e1e2ed] text-[#434655]' :
            'bg-amber-500/10 text-amber-700'
          }`}>
            {market.status}
          </span>
          {isVerified && (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 text-[12px] font-semibold tracking-[0.05em]">
              ✓ Verified
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-[15px] leading-[1.4] tracking-[-0.01em] text-[#191b23] mb-4 line-clamp-2">
          {market.title}
        </h3>

        {/* Signal Count Indicator */}
        <div className="mt-auto">
          {totalSignals > 0 ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-medium text-[#2563eb]">{totalSignals} signal{totalSignals !== 1 ? 's' : ''}</span>
              </div>
              <div className="h-2 rounded-full bg-[#e1e2ed] overflow-hidden">
                <div className="h-full bg-[#2563eb] rounded-full" style={{ width: `${Math.min(totalSignals * 10, 100)}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#737686] mb-3">No prescriptions yet</p>
          )}

          {/* Metadata Row */}
          <div className="flex items-center gap-3 text-[12px] text-[#737686] border-t border-[#e1e2ed] pt-3">
            <span className="flex items-center gap-1">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {totalSignals}
            </span>
            <span className="w-0.5 h-0.5 rounded-full bg-[#c3c6d7]"></span>
            <span>{Number(market.total_sol_locked).toFixed(2)} SOL</span>
            <span className="w-0.5 h-0.5 rounded-full bg-[#c3c6d7]"></span>
            <span>{formatDate(market.end_time)}</span>
          </div>
        </div>

      </div>
    </Link>
  )
}