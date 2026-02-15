'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation' // YENİ: Router eklendi
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { SystemProgram, Transaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { Users, TrendingUp, ExternalLink, CheckCircle, XCircle } from 'lucide-react'
import { Market, Vote } from '../types'
import VotingModal from './VotingModal'
import { supabase } from '@/lib/supabaseClient'

const TREASURY_WALLET_PUBLIC_KEY = new PublicKey('PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da')

interface MarketCardProps {
  market: Market
}

export default function MarketCard({ market }: MarketCardProps) {
  const router = useRouter() // YENİ: Yönlendirme servisi
  const { publicKey, connected, sendTransaction } = useWallet()
  const { connection } = useConnection()
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [voteType, setVoteType] = useState<'yes' | 'no'>('yes')
  const [localYesVotes, setLocalYesVotes] = useState(market.yes_count)
  const [localNoVotes, setLocalNoVotes] = useState(market.no_count)
  const [localPool, setLocalPool] = useState(market.total_pool)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)

  useEffect(() => {
    async function checkIfVoted() {
      if (!connected || !publicKey) {
        setHasVoted(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('votes')
          .select('*')
          .eq('market_id', market.id)
          .eq('user_wallet', publicKey.toBase58())
          .single()

        if (data && !error) {
          setHasVoted(true)
        } else {
          setHasVoted(false)
        }
      } catch (err) {
        setHasVoted(false)
      }
    }

    checkIfVoted()
  }, [connected, publicKey, market.id])

  const totalVotes = localYesVotes + localNoVotes
  const localParticipants = totalVotes
  
  const yesPercentage = totalVotes > 0 ? (localYesVotes / totalVotes) * 100 : 50
  const noPercentage = totalVotes > 0 ? (localNoVotes / totalVotes) * 100 : 50

  // Karta tıklandığında çalışacak fonksiyon
  const handleCardClick = () => {
    router.push(`/market/${market.id}`)
  }

  const handleVoteClick = (type: 'yes' | 'no', e: React.MouseEvent) => {
    e.stopPropagation() // Kartın tıklanmasını engelle (Sadece butona basılmış olsun)
    
    if (!connected || !publicKey) {
      setNotification({
        type: 'error',
        message: 'Please connect your wallet first!'
      })
      setTimeout(() => setNotification(null), 3000)
      return
    }
    setVoteType(type)
    setIsModalOpen(true)
  }

  const handleVote = async (vote: Vote) => {
    if (!connected || !publicKey) {
      setNotification({ type: 'error', message: 'Wallet not connected!' })
      return
    }

    setIsSubmitting(true)

    try {
      const walletAddress = publicKey.toBase58()

      // ... (Mevcut oy verme mantığı aynen korundu) ...
      // Kodun okunabilirliği için buradaki uzun mantık aynı kalıyor
      
      const lamports = Math.floor(vote.amount * LAMPORTS_PER_SOL)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: TREASURY_WALLET_PUBLIC_KEY,
          lamports: lamports,
        })
      )
      const signature = await sendTransaction(transaction, connection)
      await connection.confirmTransaction(signature, 'confirmed')

      const { error: voteError } = await supabase.from('votes').insert({
        market_id: market.id,
        user_wallet: walletAddress,
        vote_direction: vote.type,
        amount_sol: vote.amount,
        transaction_signature: signature
      })
      if (voteError) throw voteError

      const updateData: any = { total_pool: market.total_pool + vote.amount }
      if (vote.type === 'yes') updateData.yes_count = market.yes_count + 1
      else updateData.no_count = market.no_count + 1

      await supabase.from('markets').update(updateData).eq('id', market.id)

      if (vote.type === 'yes') setLocalYesVotes(prev => prev + 1)
      else setLocalNoVotes(prev => prev + 1)
      
      setLocalPool(prev => prev + vote.amount)
      setHasVoted(true)
      setNotification({ type: 'success', message: 'Vote Successful! 🎉' })
      setTimeout(() => setNotification(null), 3000)
      setIsModalOpen(false)

    } catch (error: any) {
      console.error('Error:', error)
      setNotification({ type: 'error', message: 'Transaction failed.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* DÜZELTME: <Link> kaldırıldı. 
         Yerine onClick event'i olan bir div eklendi.
      */}
      <div 
        onClick={handleCardClick}
        className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 relative h-full flex flex-col cursor-pointer group"
      >
        
        {notification && (
          <div className={`absolute top-0 left-0 right-0 z-10 p-3 flex items-center justify-center gap-2 ${
            notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white font-semibold text-sm rounded-t-2xl`}>
            {notification.type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
            {notification.message}
          </div>
        )}

        {market.outcome && (
          <div className={`absolute top-3 right-3 z-10 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm ${
            market.outcome === 'YES' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}>
            RESOLVED
          </div>
        )}
        
        <div className="p-6 flex-1">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 flex-1 pr-4 group-hover:text-blue-600 transition">
              {market.question}
            </h3>
          </div>

          {/* Progress Bars */}
          <div className="mb-6">
            <div className="flex justify-between text-sm font-semibold mb-2">
              <span className="text-green-600">YES {yesPercentage.toFixed(1)}%</span>
              <span className="text-red-600">NO {noPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex">
              <div className="bg-green-500 transition-all duration-500" style={{ width: `${yesPercentage}%` }} />
              <div className="bg-red-500 transition-all duration-500" style={{ width: `${noPercentage}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{localYesVotes} votes</span>
              <span>{localNoVotes} votes</span>
            </div>
          </div>

          {/* Butonlar */}
          {market.outcome ? (
            <div className={`border-2 font-bold py-4 rounded-lg text-center mb-6 ${
              market.outcome === 'YES'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {market.outcome} Won 🏆
            </div>
          ) : hasVoted ? (
            <div className="bg-green-50 border-2 border-green-200 text-green-700 font-bold py-4 rounded-lg text-center mb-6">
              You Voted ✅
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={(e) => handleVoteClick('yes', e)}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors shadow-md z-20 relative"
              >
                YES
              </button>
              <button
                onClick={(e) => handleVoteClick('no', e)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg transition-colors shadow-md z-20 relative"
              >
                NO
              </button>
            </div>
          )}

          {/* Alt Bilgiler */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
            <div className="flex items-center text-sm text-gray-600">
              <Users size={16} className="mr-2 text-blue-500" />
              <span className="font-semibold">{localParticipants}</span>
              <span className="ml-1">Participants</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <TrendingUp size={16} className="mr-2 text-blue-500" />
              <span className="font-semibold">{localPool.toFixed(2)}</span>
              <span className="ml-1">SOL</span>
            </div>
          </div>

          <a
            href="https://pump.fun/coin/8248ZQSM717buZAkWFRbsLEcgetSArqbpbkX638Vpump"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 rounded-lg transition-all shadow-md z-20 relative"
          >
            <span className="mr-2">💊</span>
            Trade on Pump.fun
            <ExternalLink size={16} className="ml-2" />
          </a>
        </div>
      </div>

      <VotingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={handleVote}
        referendumTitle={market.question}
        voteType={voteType}
        isSubmitting={isSubmitting}
      />
    </>
  )
}