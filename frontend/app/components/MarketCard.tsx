'use client'

import { useRouter } from 'next/navigation'
import { Users, TrendingUp, Zap } from 'lucide-react'
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
        className="flex justify-between items-center px-4 py-3 rounded-xl bg-[#00A859]/10 border border-[#00A859]/30 text-[#00A859] hover:bg-[#00A859] hover:text-white transition-colors font-bold text-[15px] cursor-pointer"
      >
        <span>Yes</span>
        <span>{yesPct}%</span>
      </button>
      <button
        onClick={(e) => e.stopPropagation()}
        className="flex justify-between items-center px-4 py-3 rounded-xl bg-[#E02424]/10 border border-[#E02424]/30 text-[#E02424] hover:bg-[#E02424] hover:text-white transition-colors font-bold text-[15px] cursor-pointer"
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
      className="bg-white dark:bg-[#1A1C24] border-2 border-gray-100 dark:border-gray-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-2xl flex flex-col justify-between p-5 min-h-[240px] cursor-pointer group"
    >
      {/* ── Icon + Title ── */}
      <div className="flex gap-3 items-start mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-md">
          <Zap size={20} />
        </div>
        <h3 className="text-[17px] font-bold text-gray-900 dark:text-white leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {market.title || market.question}
        </h3>
      </div>

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
                  <span className="font-semibold text-gray-800 dark:text-gray-200 text-[15px] truncate pr-3 flex-1">
                    {opt.title}
                  </span>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 bg-blue-600 text-white font-bold text-[14px] px-3 py-1.5 rounded-lg shadow-sm border border-blue-700 hover:bg-blue-700 transition-colors"
                  >
                    {yesPercent}%
                  </button>
                </div>
              )
            })}
            {hasMore && (
              <button
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 mt-2 inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg w-full justify-center transition-colors"
              >
                +{options.length - 2} more options
              </button>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-4 pt-3 border-t-2 border-dashed border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <span className="flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400">
            <TrendingUp size={13} />
            {totalPool.toFixed(1)} SOL
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400">
            <Users size={13} />
            {totalVotes}
          </span>
        </div>
      </div>
    </div>
  )
}