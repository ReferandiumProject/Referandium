export interface MarketOption {
  id: string
  market_id: string
  title: string
  yes_pool: number
  no_pool: number
  bid_price?: string | null
}

export interface Market {
  id: string
  title: string
  question?: string
  description?: string
  pump_fun_link?: string
  yes_count: number
  no_count: number
  total_pool: number
  created_at?: string
  end_date?: string
  image_url?: string
  outcome?: string | null
  category?: string
  options?: MarketOption[]
}

export interface Referendum {
  id: string
  title: string
  description: string
  yesVotes: number
  noVotes: number
  totalParticipants: number
  totalPool: number
  endDate: string
  pumpFunLink: string
  socialPosts: SocialPost[]
}

export interface SocialPost {
  id: string
  author: string
  content: string
  timestamp: string
  platform: 'twitter' | 'telegram'
}

export interface Vote {
  type: 'yes' | 'no'
  amount: number
}
