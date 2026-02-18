'use client'

import { useRouter } from 'next/navigation'
import { Users, TrendingUp } from 'lucide-react'
import { Market } from '../types'

interface MarketCardProps {
  market: Market
}

// ─── Simple View (Yes/No) ─────────────────────────────────────────────────────
function SimpleView({ market }: { market: Market }) {
  const opt     = market.options?.[0]
  const yesPool = opt ? Number(opt.yes_pool || 0) : (market.yes_count || 0)
  const noPool  = opt ? Number(opt.no_pool  || 0) : (market.no_count  || 0)
  const total   = yesPool + noPool
  const yesPct  = total > 0 ? Math.round((yesPool / total) * 100) : 50
  const noPct   = 100 - yesPct

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={(e) => e.stopPropagation()}
        className="flex justify-between items-center px-3 py-2 rounded-lg bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 font-bold hover:opacity-80 transition-opacity"
      >
        <span>Yes</span>
        <span>{yesPct}%</span>
      </button>
      <button
        onClick={(e) => e.stopPropagation()}
        className="flex justify-between items-center px-3 py-2 rounded-lg bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 font-bold hover:opacity-80 transition-opacity"
      >
        <span>No</span>
        <span>{noPct}%</span>
      </button>
    </div>
  )
}

// ─── Main MarketCard ──────────────────────────────────────────────────────────
export default function MarketCard({ market }: MarketCardProps) {
  const router = useRouter()

  const options        = market.options || []
  const isSimpleMarket = options.length <= 1
  const displayOptions = options.slice(0, 2)
  const hasMore        = options.length > 2

  const totalPool = options.reduce(
    (sum, opt) => sum + Number(opt.yes_pool || 0) + Number(opt.no_pool || 0), 0
  ) || Number(market.total_pool || 0)
  const totalVotes = (market.yes_count || 0) + (market.no_count || 0)

  return (
    <div
      onClick={() => router.push(`/market/${market.id}`)}
      className="flex flex-col justify-between p-5 rounded-xl bg-white dark:bg-[#181A20] border border-gray-200 dark:border-gray-800 hover:border-blue-500/50 transition-colors h-full min-h-[220px] cursor-pointer group"
    >
      {/* ── Title ── */}
      <h3 className="text-lg font-bold text-gray-900 dark:text-white line-clamp-2 mb-4 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {market.title || market.question}
      </h3>

      {/* ── Voting area ── */}
      <div className="flex-1 flex flex-col justify-end">
        {isSimpleMarket ? (
          <SimpleView market={market} />
        ) : (
          <div className="space-y-2">
            {displayOptions.map((opt) => {
              const totalPool  = Number(opt.yes_pool || 0) + Number(opt.no_pool || 0)
              const yesPercent = totalPool > 0 ? Math.round((Number(opt.yes_pool) / totalPool) * 100) : 50
              
              return (
                <div key={opt.id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate pr-3 flex-1">
                    {opt.title}
                  </span>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-bold px-3 py-2 rounded-lg hover:opacity-80 transition-opacity"
                  >
                    {yesPercent}%
                  </button>
                </div>
              )
            })}
            {hasMore && (
              <p className="text-sm text-gray-400 mt-2">
                +{options.length - 2} more options (Click to view)
              </p>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800/80 pt-3 mt-3">
          <span className="flex items-center gap-1">
            <TrendingUp size={12} />
            {totalPool.toFixed(1)} SOL
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {totalVotes}
          </span>
        </div>
      </div>
    </div>
  )
}