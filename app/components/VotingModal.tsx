'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Vote } from '../types'

interface VotingModalProps {
  isOpen: boolean
  onClose: () => void
  onVote: (vote: Vote) => Promise<void>
  referendumTitle: string
  voteType: 'yes' | 'no'
  isSubmitting?: boolean
}

export default function VotingModal({ isOpen, onClose, onVote, referendumTitle, voteType, isSubmitting = false }: VotingModalProps) {
  const [solAmount, setSolAmount] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(solAmount)
    if (amount > 0) {
      await onVote({ type: voteType, amount })
      setSolAmount('')
    }
  }

  const bgColor = voteType === 'yes' ? 'bg-yes' : 'bg-no'
  const buttonColor = voteType === 'yes' ? 'bg-yes hover:bg-blue-700' : 'bg-no hover:bg-orange-600'
  const voteText = voteType === 'yes' ? 'YES' : 'NO'

  const totalVotes = 1
  const poolShare = solAmount ? ((parseFloat(solAmount) / (parseFloat(solAmount) + 100)) * 100).toFixed(2) : '0.00'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        <div className={`${bgColor} text-white rounded-lg p-4 mb-6`}>
          <h2 className="text-2xl font-bold mb-2">Invest & Vote {voteText}</h2>
          <p className="text-sm opacity-90">{referendumTitle}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="solAmount" className="block text-sm font-semibold text-gray-700 mb-2">
              SOL Amount to Invest
            </label>
            <div className="relative">
              <input
                type="number"
                id="solAmount"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                step="0.01"
                min="0.01"
                placeholder="0.00"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary text-lg font-semibold"
                required
              />
              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold">
                SOL
              </span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Voting Power:</span>
              <span className="font-semibold">1 Wallet = 1 Vote</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Pool Contribution:</span>
              <span className="font-semibold">{solAmount || '0.00'} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your Pool Share:</span>
              <span className="font-semibold text-primary">{poolShare}%</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full ${buttonColor} text-white font-bold py-4 rounded-lg transition-colors text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing Transaction...
              </>
            ) : (
              `Submit ${voteText} Vote`
            )}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          Your vote will be permanently recorded on the blockchain.
        </p>
      </div>
    </div>
  )
}
