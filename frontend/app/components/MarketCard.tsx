'use client'

import { useRouter } from 'next/navigation'
import { Users, TrendingUp, Zap } from 'lucide-react'
import { Market } from '../types'

interface MarketCardProps {
  market: Market
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
};

export default function MarketCard({ market }: MarketCardProps) {
  const router = useRouter()

  const getStatusBadge = () => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      closed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    }
    return colors[market.status] || colors.draft
  }

  const formatGookieWallet = (wallet: string | null) => {
    if (!wallet) return 'Platform'
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
  }

  return (
    <div
      onClick={() => router.push(`/market/${market.id}`)}
      className="bg-white dark:bg-[#1A1C24] border-2 border-gray-100 dark:border-gray-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-2xl flex flex-col justify-between p-5 min-h-[260px] cursor-pointer group"
    >
      {/* Header */}
      <div className="flex gap-3 items-start mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-md">
          <Zap size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-[17px] font-bold text-gray-900 dark:text-white leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {market.title}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${getStatusBadge()}`}>
              {market.status}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
              {market.market_type}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex-1 flex flex-col justify-end">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Signals</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{market.total_signals}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">SOL Locked</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{market.total_sol_locked.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Pump.fun Trade Button */}
        <a
          href="https://pump.fun/coin/8248ZQSM717buZAkWFRbsLEcgetSArqbpbkX638Vpump"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex justify-center items-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm transition-all duration-200 shadow-md hover:shadow-xl"
        >
          💊 Trade on pump.fun
        </a>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t-2 border-dashed border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <span className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            <Users size={12} />
            Gookie: {formatGookieWallet(market.gookie_wallet || null)}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Ends {formatDate(market.end_time)}
          </span>
        </div>
      </div>
    </div>
  )
}