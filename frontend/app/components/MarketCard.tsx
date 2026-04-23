'use client'

import Link from 'next/link'
import { Market } from '../types'

interface MarketCardProps {
  market: Market
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
};

export default function MarketCard({ market }: MarketCardProps) {
  const yesTotal = market.options?.reduce((sum, o) => sum + (o.yes_signals || 0), 0) || 0;
  const noTotal = market.options?.reduce((sum, o) => sum + (o.no_signals || 0), 0) || 0;
  const signalCount = yesTotal + noTotal;
  const yesPct = signalCount > 0 ? Math.round((yesTotal / signalCount) * 100) : 0;
  const noPct = signalCount > 0 ? 100 - yesPct : 0;

  const statusBg = market.status === 'active' ? '#DCFCE7' : '#F1F5F9';
  const statusColor = market.status === 'active' ? '#16A34A' : '#64748B';

  return (
    <Link href={`/market/${market.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px',
        padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer',
        transition: 'box-shadow 0.2s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
      >

        {/* 1. Top row: category + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ backgroundColor: '#F1F5F9', color: '#64748B', fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '9999px' }}>
            {market.category || 'General'}
          </span>
          <span style={{ backgroundColor: statusBg, color: statusColor, fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', textTransform: 'capitalize' }}>
            {market.status}
          </span>
        </div>

        {/* 2. Title */}
        <h3 style={{
          fontSize: '15px', fontWeight: 600, color: '#0F172A', lineHeight: 1.4,
          marginTop: '12px', overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {market.title}
        </h3>

        {/* 3. YES/NO bar */}
        <div style={{ marginTop: '14px' }}>
          {signalCount > 0 ? (
            <>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px' }}>
                YES {yesPct}% · NO {noPct}%
              </p>
              <div style={{ height: '4px', borderRadius: '2px', backgroundColor: '#E2E8F0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${yesPct}%`, backgroundColor: '#2563EB', borderRadius: '2px' }} />
              </div>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>No signals yet</p>
          )}
        </div>

        {/* 4. Stats row */}
        <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '12px' }}>
          {market.total_signals} signals · {market.total_sol_locked.toFixed(2)} SOL · Ends {formatDate(market.end_time)}
        </p>

        {/* 5. Bottom row */}
        <div style={{ marginTop: '16px', borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {market.gookie_wallet ? (
            <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 500 }}>✓ Verified</span>
          ) : (
            <span />
          )}
          <span style={{ fontSize: '13px', color: '#2563EB', fontWeight: 500 }}>View market →</span>
        </div>

      </div>
    </Link>
  )
}