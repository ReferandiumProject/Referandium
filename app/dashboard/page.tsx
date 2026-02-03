'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Loader2 } from 'lucide-react'
import MarketCard from '../components/MarketCard'
import WalletButton from '../components/ui/WalletButton'
import { supabase } from '@/lib/supabaseClient'
import { Market } from '../types'

export default function Dashboard() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMarkets() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('markets')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error

        setMarkets(data || [])
      } catch (err) {
        console.error('Error fetching markets:', err)
        setError('Failed to load markets. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchMarkets()
  }, [])

  return (
    <main className="min-h-screen bg-white">
      <header className="bg-primary text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <TrendingUp size={32} className="font-bold" />
              <h1 className="text-3xl font-bold">Referandium</h1>
            </Link>
            <WalletButton />
          </div>
          <p className="text-blue-100 mt-2 text-sm">
            Policy Prescription Market - 1 Wallet = 1 Vote
          </p>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Active Markets</h2>
          <p className="text-gray-600">Vote on policy outcomes and join the community hedge fund</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <p className="text-gray-600 text-lg">Loading markets...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600 font-semibold">{error}</p>
          </div>
        ) : markets.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg">No markets available yet.</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon for new policy markets!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        )}
      </div>

      <footer className="bg-gray-50 border-t border-gray-200 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600 text-sm">
            <p className="font-semibold mb-2">Referandium - Policy Prescription Market</p>
            <p className="text-xs">Transparent and secure blockchain-based voting system</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
