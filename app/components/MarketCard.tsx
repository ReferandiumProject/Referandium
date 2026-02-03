'use client'

import { useState, useEffect } from 'react'
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

  const handleVoteClick = (type: 'yes' | 'no') => {
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
      setNotification({
        type: 'error',
        message: 'Wallet not connected!'
      })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    if (!vote.amount || vote.amount <= 0) {
      setNotification({
        type: 'error',
        message: 'Please enter a valid amount!'
      })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    setIsSubmitting(true)

    try {
      const walletAddress = publicKey.toBase58()

      const { data: existingVote } = await supabase
        .from('votes')
        .select('*')
        .eq('market_id', market.id)
        .eq('user_wallet', walletAddress)
        .single()

      if (existingVote) {
        setNotification({
          type: 'error',
          message: 'You have already voted on this market!'
        })
        setTimeout(() => setNotification(null), 3000)
        setIsSubmitting(false)
        setIsModalOpen(false)
        return
      }

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

      const { error: voteError } = await supabase
        .from('votes')
        .insert({
          market_id: market.id,
          user_wallet: walletAddress,
          vote_direction: vote.type,
          amount_sol: vote.amount,
          transaction_signature: signature
        })

      if (voteError) throw voteError

      const updateData: any = {
        total_pool: market.total_pool + vote.amount
      }

      if (vote.type === 'yes') {
        updateData.yes_count = market.yes_count + 1
      } else {
        updateData.no_count = market.no_count + 1
      }

      const { error: updateError } = await supabase
        .from('markets')
        .update(updateData)
        .eq('id', market.id)

      if (updateError) throw updateError

      if (vote.type === 'yes') {
        setLocalYesVotes(prev => prev + 1)
      } else {
        setLocalNoVotes(prev => prev + 1)
      }
      setLocalPool(prev => prev + vote.amount)
      setHasVoted(true)

      setNotification({
        type: 'success',
        message: 'Vote Successful! 🎉'
      })
      setTimeout(() => setNotification(null), 3000)

      setIsModalOpen(false)

    } catch (error: any) {
      console.error('Error submitting vote:', error)
      
      let errorMessage = 'Failed to submit vote. Please try again.'
      
      if (error?.message?.includes('User rejected')) {
        errorMessage = 'Transaction cancelled by user.'
      } else if (error?.message?.includes('insufficient')) {
        errorMessage = 'Insufficient SOL balance.'
      } else if (error?.message?.includes('Transaction')) {
        errorMessage = 'Blockchain transaction failed.'
      }
      
      setNotification({
        type: 'error',
        message: errorMessage
      })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-gray-100 relative">
        {notification && (
          <div className={`absolute top-0 left-0 right-0 z-10 p-3 flex items-center justify-center gap-2 ${
            notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white font-semibold text-sm rounded-t-2xl`}>
            {notification.type === 'success' ? (
              <CheckCircle size={18} />
            ) : (
              <XCircle size={18} />
            )}
            {notification.message}
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 flex-1 pr-4">
              {market.question}
            </h3>
          </div>

          {market.description && (
            <p className="text-gray-600 text-sm mb-6 line-clamp-2">
              {market.description}
            </p>
          )}

          <div className="mb-6">
            <div className="flex justify-between text-sm font-semibold mb-2">
              <span className="text-yes">YES {yesPercentage.toFixed(1)}%</span>
              <span className="text-no">NO {noPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex">
              <div
                className="bg-yes transition-all duration-500"
                style={{ width: `${yesPercentage}%` }}
              />
              <div
                className="bg-no transition-all duration-500"
                style={{ width: `${noPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{localYesVotes} votes</span>
              <span>{localNoVotes} votes</span>
            </div>
          </div>

          {hasVoted ? (
            <div className="bg-green-50 border-2 border-green-200 text-green-700 font-bold py-4 rounded-lg text-center mb-6">
              You Voted ✅
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => handleVoteClick('yes')}
                className="bg-yes hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md"
              >
                YES
              </button>
              <button
                onClick={() => handleVoteClick('no')}
                className="bg-no hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors shadow-md"
              >
                NO
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
            <div className="flex items-center text-sm text-gray-600">
              <Users size={16} className="mr-2 text-primary" />
              <span className="font-semibold">{localParticipants}</span>
              <span className="ml-1">Participants</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <TrendingUp size={16} className="mr-2 text-primary" />
              <span className="font-semibold">{localPool.toFixed(2)}</span>
              <span className="ml-1">SOL Pool</span>
            </div>
          </div>

          {market.pump_fun_link && (
            <a
              href={market.pump_fun_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 rounded-lg transition-all shadow-md"
            >
              <span className="mr-2">💊</span>
              Trade on Pump.fun
              <ExternalLink size={16} className="ml-2" />
            </a>
          )}
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
