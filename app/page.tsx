import Link from 'next/link'
import { TrendingUp, Shield, Users, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <nav className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp size={28} className="text-primary" />
              <span className="text-2xl font-bold text-gray-900">Referandium</span>
            </div>
            <Link href="/dashboard">
              <button className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md">
                Launch App
              </button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            The World's First<br />
            <span className="text-primary">Policy Prescription Market</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-2xl mx-auto">
            Vote with your conviction. Join the community hedge fund on Solana.
          </p>

          <Link href="/dashboard">
            <button className="bg-primary text-white px-12 py-5 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 inline-flex items-center space-x-3">
              <span>Launch App</span>
              <ArrowRight size={24} />
            </button>
          </Link>
        </div>
      </section>

      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-6">
              <div className="bg-primary bg-opacity-10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={32} className="text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Transparent & Secure</h3>
              <p className="text-gray-600">
                Blockchain-based voting ensures complete transparency and security for all participants.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="bg-primary bg-opacity-10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users size={32} className="text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Equal Voting Power</h3>
              <p className="text-gray-600">
                One wallet equals one vote. Fair and democratic decision-making for everyone.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="bg-primary bg-opacity-10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp size={32} className="text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Community Hedge Fund</h3>
              <p className="text-gray-600">
                Pool resources together and invest in the outcomes you believe in most.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center text-gray-600 text-sm">
            <p className="font-semibold mb-2">Referandium - Policy Prescription Market</p>
            <p className="text-xs">Powered by Solana blockchain</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
