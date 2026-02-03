'use client'

import { useState } from 'react'
import { Calendar, Users, TrendingUp, ExternalLink, Twitter, MessageCircle } from 'lucide-react'
import { Referendum, Vote } from '../types'
import VotingModal from './VotingModal'

interface ReferendumCardProps {
  referendum: Referendum
}

export default function ReferendumCard({ referendum }: ReferendumCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [voteType, setVoteType] = useState<'yes' | 'no'>('yes')
  const [localYesVotes, setLocalYesVotes] = useState(referendum.yesVotes)
  const [localNoVotes, setLocalNoVotes] = useState(referendum.noVotes)
  const [localParticipants, setLocalParticipants] = useState(referendum.totalParticipants)
  const [localPool, setLocalPool] = useState(referendum.totalPool)

  const totalVotes = localYesVotes + localNoVotes
  const yesPercentage = totalVotes > 0 ? (localYesVotes / totalVotes) * 100 : 0
  const noPercentage = totalVotes > 0 ? (localNoVotes / totalVotes) * 100 : 0

  const handleVoteClick = (type: 'yes' | 'no') => {
    setVoteType(type)
    setIsModalOpen(true)
  }

  const handleVote = (vote: Vote) => {
    if (vote.type === 'yes') {
      setLocalYesVotes(prev => prev + 1)
    } else {
      setLocalNoVotes(prev => prev + 1)
    }
    setLocalParticipants(prev => prev + 1)
    setLocalPool(prev => prev + vote.amount)
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-gray-100">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900 flex-1 pr-4">
              {referendum.title}
            </h3>
            <div className="flex items-center text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              <Calendar size={14} className="mr-1" />
              <span className="text-xs">{new Date(referendum.endDate).toLocaleDateString('en-US')}</span>
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-6 line-clamp-2">
            {referendum.description}
          </p>

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

          <a
            href={referendum.pumpFunLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 rounded-lg transition-all shadow-md mb-4"
          >
            <span className="mr-2">💊</span>
            Trade on Pump.fun
            <ExternalLink size={16} className="ml-2" />
          </a>

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
              <MessageCircle size={16} className="mr-2" />
              Social Feed
            </h4>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {referendum.socialPosts.map((post) => (
                <div key={post.id} className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center">
                      {post.platform === 'twitter' ? (
                        <Twitter size={14} className="text-blue-400 mr-2" />
                      ) : (
                        <MessageCircle size={14} className="text-blue-500 mr-2" />
                      )}
                      <span className="text-xs font-semibold text-gray-700">{post.author}</span>
                    </div>
                    <span className="text-xs text-gray-400">{post.timestamp}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{post.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <VotingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={handleVote}
        referendumTitle={referendum.title}
        voteType={voteType}
      />
    </>
  )
}
