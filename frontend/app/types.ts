// ============================================
// REFERANDIUM V2 TYPES - SIGNAL-BASED YIELD SHARING
// ============================================

export interface Market {
  id: string
  title: string
  description?: string
  category?: string
  image_url?: string
  market_type: 'binary' | 'multiple'
  gookie_id?: string | null
  gookie_wallet?: string | null
  start_time?: string
  end_time: string
  status: 'draft' | 'active' | 'closed'
  total_signals: number
  total_sol_locked: number
  total_yield_earned: number
  platform_fee_collected: number
  gookie_fee_earned: number
  user_share_distributed: number
  buyback_burn_amount: number
  min_signal_sol: number
  created_at?: string
  updated_at?: string
  options?: MarketOption[]
  on_chain_market_id?: string | null
  escrow_pda?: string | null
  market_closed_tx?: string | null
  resolve_criteria?: string | null
  cause_token_name?: string | null
  cause_token_symbol?: string | null
  cause_token_address?: string | null
  cause_token_image?: string | null
  cause_token_enabled?: boolean | null
}

export interface MarketOption {
  id: string
  market_id: string
  title: string
  description?: string
  yes_signals: number
  no_signals: number
  total_sol_on_option: number
  created_at?: string
}

export interface Signal {
  id: string
  market_id: string
  option_id?: string | null
  user_wallet: string
  signal_direction: 'yes' | 'no'
  sol_amount: number
  yield_earned: number
  principal_returned: boolean
  yield_claimed: boolean
  deposit_tx_signature?: string | null
  withdrawal_tx_signature?: string | null
  created_at?: string
  withdrawn_at?: string | null
}

export interface Gookie {
  id: string
  title: string
  description?: string
  image_url?: string
  starting_bid_rfrm: number
  winning_bid_rfrm: number
  winner_wallet?: string | null
  auction_start_time?: string
  auction_end_time: string
  nft_mint_address?: string | null
  rfrm_locked_amount: number
  status: 'auction' | 'won' | 'market_active' | 'market_closed' | 'penalized' | 'completed'
  is_slashed: boolean
  slash_amount: number
  slash_reason?: string | null
  slash_date?: string | null
  fee_earned_rfrm: number
  fee_paid: boolean
  created_at?: string
  updated_at?: string
  created_by_wallet: string
  on_chain_address?: string | null
  on_chain_tx?: string | null
  auction_id?: number | null
  close_tx?: string | null
  slash_tx?: string | null
  release_tx?: string | null
  nft_mint_tx?: string | null
  is_verified?: boolean
  display_name?: string | null
}

export interface GookieBid {
  id: string
  gookie_id: string
  bidder_wallet: string
  bid_amount_rfrm: number
  transaction_signature?: string | null
  created_at?: string
}

export interface User {
  id: string
  wallet_address: string
  username?: string | null
  bio?: string | null
  avatar_url?: string | null
  total_signals_made: number
  total_yield_earned: number
  created_at?: string
}

export interface Comment {
  id: string
  market_id: string
  user_wallet: string
  username?: string | null
  content: string
  created_at?: string
}

export interface YieldRecord {
  id: string
  market_id: string
  yield_amount: number
  yield_source?: string | null
  period_start: string
  period_end: string
  recorded_at?: string
}

export interface FeeDistribution {
  id: string
  market_id: string
  total_yield: number
  platform_fee: number
  gookie_fee: number
  user_share: number
  buyback_burn: number
  gookie_fee_rfrm?: number | null
  gookie_payment_tx?: string | null
  rfrm_bought?: number | null
  rfrm_burn_tx?: string | null
  distribution_complete: boolean
  distributed_at?: string | null
  created_at?: string
}

export interface GookiePenalty {
  id: string
  gookie_id: string
  gookie_wallet: string
  penalty_type: 'early_abandonment' | 'misbehavior' | 'platform_seizure'
  original_locked_rfrm: number
  penalty_amount_rfrm: number
  returned_amount_rfrm: number
  reason: string
  time_elapsed_days?: number | null
  total_expected_days?: number | null
  market_id?: string | null
  penalty_tx_signature?: string | null
  penalized_at?: string
  executed_by_wallet: string
}

// Legacy types (kept for backwards compatibility during migration)
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
