import { Referendum } from '../types'

export const mockReferendums: Referendum[] = [
  {
    id: '1',
    title: 'Will Solana ETF Be Approved?',
    description: 'Community vote on whether the US SEC will approve a Solana ETF in 2025.',
    yesVotes: 127,
    noVotes: 83,
    totalParticipants: 210,
    totalPool: 1250.5,
    endDate: '2025-03-15',
    pumpFunLink: 'https://pump.fun/token/sol-etf',
    socialPosts: [
      {
        id: 's1',
        author: '@cryptowhale',
        content: 'SEC approval of Solana ETF is inevitable. After Ethereum ETF, Solana is next! 🚀',
        timestamp: '2 hours ago',
        platform: 'twitter'
      },
      {
        id: 's2',
        author: '@solanatrader',
        content: 'Technical analysis: SOL could see $200. ETF approval will be the catalyst.',
        timestamp: '5 hours ago',
        platform: 'telegram'
      },
      {
        id: 's3',
        author: '@defianalyst',
        content: 'Market is pricing in ETF approval. High expectations but risks remain.',
        timestamp: '1 day ago',
        platform: 'twitter'
      }
    ]
  },
  {
    id: '2',
    title: 'Will Bitcoin Reach $150K in 2025?',
    description: 'Vote on whether Bitcoin will reach $150,000 by the end of 2025.',
    yesVotes: 342,
    noVotes: 158,
    totalParticipants: 500,
    totalPool: 3420.75,
    endDate: '2025-12-31',
    pumpFunLink: 'https://pump.fun/token/btc-150k',
    socialPosts: [
      {
        id: 's4',
        author: '@btcmaximalist',
        content: 'Post-halving always brings new ATH. This time won\'t be different! 📈',
        timestamp: '1 hour ago',
        platform: 'twitter'
      },
      {
        id: 's5',
        author: '@cryptoanalysis',
        content: 'On-chain data shows strong accumulation. Whales are buying.',
        timestamp: '3 hours ago',
        platform: 'telegram'
      }
    ]
  },
  {
    id: '3',
    title: 'Will Ethereum Become Deflationary Post-Merge?',
    description: 'Whether Ethereum will become a net deflationary asset after the PoS transition.',
    yesVotes: 89,
    noVotes: 156,
    totalParticipants: 245,
    totalPool: 892.3,
    endDate: '2025-06-30',
    pumpFunLink: 'https://pump.fun/token/eth-deflationary',
    socialPosts: [
      {
        id: 's6',
        author: '@ethresearch',
        content: 'Burn rate isn\'t sufficient to achieve deflation with low transaction volume.',
        timestamp: '4 hours ago',
        platform: 'twitter'
      },
      {
        id: 's7',
        author: '@vitalikbuterin',
        content: 'Layer 2 solutions are reducing mainnet transaction volume, affecting deflation.',
        timestamp: '1 day ago',
        platform: 'twitter'
      }
    ]
  },
  {
    id: '4',
    title: 'Will US Crypto Regulation Pass in 2025?',
    description: 'Whether comprehensive cryptocurrency regulation will be enacted in the US in 2025.',
    yesVotes: 203,
    noVotes: 97,
    totalParticipants: 300,
    totalPool: 1567.8,
    endDate: '2025-12-31',
    pumpFunLink: 'https://pump.fun/token/us-regulation',
    socialPosts: [
      {
        id: 's8',
        author: '@cryptonews',
        content: 'Crypto bill is on the agenda in Congress. Likely to pass in 2025.',
        timestamp: '30 minutes ago',
        platform: 'telegram'
      },
      {
        id: 's9',
        author: '@economist',
        content: 'If regulation passes, the market will see major changes. Be prepared!',
        timestamp: '2 hours ago',
        platform: 'twitter'
      }
    ]
  },
  {
    id: '5',
    title: 'Will AI Tokens Outperform in 2025?',
    description: 'Whether AI-focused crypto projects will outperform the broader market in 2025.',
    yesVotes: 412,
    noVotes: 188,
    totalParticipants: 600,
    totalPool: 4523.2,
    endDate: '2025-12-31',
    pumpFunLink: 'https://pump.fun/token/ai-tokens',
    socialPosts: [
      {
        id: 's10',
        author: '@aitrader',
        content: 'AI narrative will be the strongest theme of 2025. Watching Render, FET, AGIX.',
        timestamp: '1 hour ago',
        platform: 'twitter'
      },
      {
        id: 's11',
        author: '@cryptovc',
        content: 'VC funds are flowing into AI+Crypto projects. Huge potential here.',
        timestamp: '6 hours ago',
        platform: 'telegram'
      }
    ]
  },
  {
    id: '6',
    title: 'Will DeFi TVL Exceed $200B in 2025?',
    description: 'Whether total DeFi locked value (TVL) will exceed $200 billion by the end of 2025.',
    yesVotes: 156,
    noVotes: 234,
    totalParticipants: 390,
    totalPool: 2134.6,
    endDate: '2025-12-31',
    pumpFunLink: 'https://pump.fun/token/defi-tvl',
    socialPosts: [
      {
        id: 's12',
        author: '@defillama',
        content: 'Current TVL is around $85B. Need 2.5x growth to reach $200B.',
        timestamp: '3 hours ago',
        platform: 'twitter'
      },
      {
        id: 's13',
        author: '@yieldfarmer',
        content: 'New protocols and Layer 2s will support TVL growth.',
        timestamp: '8 hours ago',
        platform: 'telegram'
      }
    ]
  }
]
