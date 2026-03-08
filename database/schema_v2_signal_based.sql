-- ============================================
-- REFERANDIUM V2 - SIGNAL-BASED YIELD SHARING SCHEMA
-- ============================================
-- Complete redesign: NOT a prediction market
-- Users signal opinions by depositing SOL, earn yield, get principal back
-- 1 wallet = 1 vote per market (strictly enforced)
-- Gookies manage markets, paid in RFRM from yield
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. GOOKIES TABLE (Auction Winners with Market Management Rights)
-- ============================================
CREATE TABLE IF NOT EXISTS gookies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Auction Info
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  
  -- Auction Details
  starting_bid_rfrm NUMERIC NOT NULL DEFAULT 100, -- Starting bid in RFRM tokens
  winning_bid_rfrm NUMERIC DEFAULT 0, -- Final winning bid amount
  winner_wallet TEXT, -- Solana wallet address of winner
  
  -- Auction Timing
  auction_start_time TIMESTAMPTZ DEFAULT NOW(),
  auction_end_time TIMESTAMPTZ NOT NULL,
  
  -- NFT & Rights
  nft_mint_address TEXT, -- Solana NFT mint address granting market creation rights
  rfrm_locked_amount NUMERIC DEFAULT 0, -- RFRM tokens locked (same as winning bid)
  
  -- Status
  status TEXT NOT NULL DEFAULT 'auction' 
    CHECK (status IN ('auction', 'won', 'market_active', 'market_closed', 'penalized', 'completed')),
  
  -- Penalty Tracking
  is_slashed BOOLEAN DEFAULT FALSE,
  slash_amount NUMERIC DEFAULT 0, -- RFRM seized by platform
  slash_reason TEXT,
  slash_date TIMESTAMPTZ,
  
  -- Fee Earned (after market closes)
  fee_earned_rfrm NUMERIC DEFAULT 0,
  fee_paid BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_wallet TEXT NOT NULL -- Platform admin who created auction
);

COMMENT ON TABLE gookies IS 'Auction winners who earn rights to create and manage one market';
COMMENT ON COLUMN gookies.rfrm_locked_amount IS 'RFRM locked when auction won, released after market closes or slashed if penalized';
COMMENT ON COLUMN gookies.nft_mint_address IS 'NFT proving market management rights for this Gookie';
COMMENT ON COLUMN gookies.status IS 'auction=bidding active, won=auction ended but market not created, market_active=managing active market, market_closed=market ended, penalized=slashed, completed=fees paid and tokens returned';

-- ============================================
-- 2. GOOKIE BIDS TABLE (RFRM Token Bids)
-- ============================================
CREATE TABLE IF NOT EXISTS gookie_bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gookie_id UUID NOT NULL REFERENCES gookies(id) ON DELETE CASCADE,
  
  -- Bidder Info
  bidder_wallet TEXT NOT NULL,
  bid_amount_rfrm NUMERIC NOT NULL, -- Bid in RFRM tokens
  
  -- Blockchain Proof
  transaction_signature TEXT, -- Solana tx signature of RFRM transfer
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE gookie_bids IS 'RFRM token bids for Gookie auctions';

-- ============================================
-- 3. MARKETS TABLE (Signal-Based, No Win/Lose)
-- ============================================
CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Other',
  image_url TEXT,
  
  -- Market Type
  market_type TEXT NOT NULL DEFAULT 'binary' CHECK (market_type IN ('binary', 'multiple')),
  
  -- Gookie Relationship (WHO manages this market)
  gookie_id UUID REFERENCES gookies(id) ON DELETE SET NULL,
  gookie_wallet TEXT, -- Wallet of the Gookie manager
  
  -- Timing
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ NOT NULL,
  
  -- Status (NO "resolved" - markets just close)
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'active', 'closed')),
  
  -- Signal Tracking (COUNT only, not amounts)
  total_signals INTEGER DEFAULT 0, -- Total number of wallets that signaled
  total_sol_locked NUMERIC DEFAULT 0, -- Total SOL deposited (for yield calculation)
  
  -- Yield & Fees
  total_yield_earned NUMERIC DEFAULT 0, -- Total yield generated while market active
  platform_fee_collected NUMERIC DEFAULT 0, -- 20% of yield
  gookie_fee_earned NUMERIC DEFAULT 0, -- 30% of yield (paid in RFRM)
  user_share_distributed NUMERIC DEFAULT 0, -- 45% of yield returned to users
  buyback_burn_amount NUMERIC DEFAULT 0, -- 5% of yield for RFRM buyback & burn
  
  -- Minimum Signal Amount
  min_signal_sol NUMERIC DEFAULT 0.05,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE markets IS 'Signal-based markets - users deposit SOL to signal opinion, earn yield, get principal back';
COMMENT ON COLUMN markets.status IS 'draft=gookie setting up, active=accepting signals, closed=ended (no resolution concept)';
COMMENT ON COLUMN markets.total_signals IS 'Number of unique wallets that signaled (1 wallet = 1 vote enforced)';
COMMENT ON COLUMN markets.gookie_wallet IS 'Wallet address of the Gookie managing this market';

-- ============================================
-- 4. MARKET OPTIONS TABLE (For Multi-Option Markets)
-- ============================================
CREATE TABLE IF NOT EXISTS market_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  
  -- Option Info
  title TEXT NOT NULL,
  description TEXT,
  
  -- Signal Counts (YES/NO on this specific option)
  yes_signals INTEGER DEFAULT 0, -- Number of wallets signaling YES on this option
  no_signals INTEGER DEFAULT 0, -- Number of wallets signaling NO on this option
  total_sol_on_option NUMERIC DEFAULT 0, -- SOL deposited on this option (all directions)
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE market_options IS 'Options for multi-choice markets. Each option can be voted YES or NO independently';

-- ============================================
-- 5. SIGNALS TABLE (Renamed from "votes" - User Opinions)
-- ============================================
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Market & Option
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  option_id UUID REFERENCES market_options(id) ON DELETE CASCADE, -- NULL for binary markets
  
  -- User & Direction
  user_wallet TEXT NOT NULL,
  signal_direction TEXT NOT NULL CHECK (signal_direction IN ('yes', 'no')),
  
  -- SOL Amount (affects yield share, NOT vote weight)
  sol_amount NUMERIC NOT NULL CHECK (sol_amount >= 0.05),
  
  -- Yield Tracking
  yield_earned NUMERIC DEFAULT 0, -- User's share of yield from this signal
  principal_returned BOOLEAN DEFAULT FALSE, -- Has SOL been returned to user
  yield_claimed BOOLEAN DEFAULT FALSE, -- Has yield been distributed
  
  -- Blockchain Proof
  deposit_tx_signature TEXT, -- Solana tx when SOL deposited to escrow
  withdrawal_tx_signature TEXT, -- Solana tx when SOL + yield returned
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ
);

COMMENT ON TABLE signals IS 'User signals (opinions) on markets. 1 wallet = 1 signal per market enforced by unique constraint';
COMMENT ON COLUMN signals.sol_amount IS 'SOL deposited - affects yield share but NOT vote weight (1 wallet = 1 vote)';

-- CRITICAL: Enforce 1 wallet = 1 vote per market
CREATE UNIQUE INDEX idx_signals_one_vote_per_market 
  ON signals(market_id, user_wallet);

COMMENT ON INDEX idx_signals_one_vote_per_market IS 'ENFORCES 1 WALLET = 1 SIGNAL PER MARKET (core rule)';

-- ============================================
-- 6. YIELD RECORDS TABLE (Track Yield Generation)
-- ============================================
CREATE TABLE IF NOT EXISTS yield_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Market
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  
  -- Yield Info
  yield_amount NUMERIC NOT NULL, -- SOL yield generated
  yield_source TEXT, -- e.g., 'staking', 'lending', 'liquidity_provision'
  
  -- Timing
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE yield_records IS 'Historical record of yield generated per market per period';

-- ============================================
-- 7. FEE DISTRIBUTIONS TABLE (Track All Fee Payments)
-- ============================================
CREATE TABLE IF NOT EXISTS fee_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Market
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  
  -- Fee Breakdown (from yield only)
  total_yield NUMERIC NOT NULL,
  platform_fee NUMERIC NOT NULL, -- 20%
  gookie_fee NUMERIC NOT NULL, -- 30% (paid in RFRM via swap)
  user_share NUMERIC NOT NULL, -- 45%
  buyback_burn NUMERIC NOT NULL, -- 5%
  
  -- Gookie Payment
  gookie_fee_rfrm NUMERIC, -- RFRM amount sent to Gookie (after Jupiter swap)
  gookie_payment_tx TEXT, -- Transaction signature
  
  -- Buyback & Burn
  rfrm_bought NUMERIC, -- RFRM bought with 5% for burn
  rfrm_burn_tx TEXT, -- Burn transaction signature
  
  -- Status
  distribution_complete BOOLEAN DEFAULT FALSE,
  distributed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fee_distributions IS 'Record of fee distributions after market closes';
COMMENT ON COLUMN fee_distributions.gookie_fee_rfrm IS 'Gookie receives fee in RFRM tokens (swapped via Jupiter from SOL yield)';

-- ============================================
-- 8. GOOKIE PENALTIES TABLE (Slashing Events)
-- ============================================
CREATE TABLE IF NOT EXISTS gookie_penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Gookie
  gookie_id UUID NOT NULL REFERENCES gookies(id) ON DELETE CASCADE,
  gookie_wallet TEXT NOT NULL,
  
  -- Penalty Info
  penalty_type TEXT NOT NULL CHECK (penalty_type IN ('early_abandonment', 'misbehavior', 'platform_seizure')),
  original_locked_rfrm NUMERIC NOT NULL,
  penalty_amount_rfrm NUMERIC NOT NULL, -- RFRM seized
  returned_amount_rfrm NUMERIC DEFAULT 0, -- RFRM returned (proportional to time if early exit)
  
  -- Reason
  reason TEXT NOT NULL,
  time_elapsed_days INTEGER, -- For proportional penalty calculation
  total_expected_days INTEGER,
  
  -- Market Context
  market_id UUID REFERENCES markets(id),
  
  -- Blockchain Proof
  penalty_tx_signature TEXT,
  
  -- Timing
  penalized_at TIMESTAMPTZ DEFAULT NOW(),
  executed_by_wallet TEXT NOT NULL -- Platform admin wallet
);

COMMENT ON TABLE gookie_penalties IS 'Record of Gookie slashing/penalty events';
COMMENT ON COLUMN gookie_penalties.penalty_type IS 'early_abandonment=gookie left before market end, misbehavior=fraud/abuse, platform_seizure=admin action';

-- ============================================
-- 9. USERS TABLE (Unchanged)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT,
  bio TEXT,
  avatar_url TEXT,
  
  -- Stats
  total_signals_made INTEGER DEFAULT 0,
  total_yield_earned NUMERIC DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE users IS 'User profiles linked to Solana wallet addresses';

-- ============================================
-- 10. COMMENTS TABLE (Unchanged)
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_wallet TEXT NOT NULL,
  username TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Gookies
CREATE INDEX IF NOT EXISTS idx_gookies_status ON gookies(status);
CREATE INDEX IF NOT EXISTS idx_gookies_winner_wallet ON gookies(winner_wallet);
CREATE INDEX IF NOT EXISTS idx_gookies_auction_end ON gookies(auction_end_time);

-- Gookie Bids
CREATE INDEX IF NOT EXISTS idx_gookie_bids_gookie_id ON gookie_bids(gookie_id);
CREATE INDEX IF NOT EXISTS idx_gookie_bids_bidder ON gookie_bids(bidder_wallet);

-- Markets
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_gookie_id ON markets(gookie_id);
CREATE INDEX IF NOT EXISTS idx_markets_gookie_wallet ON markets(gookie_wallet);
CREATE INDEX IF NOT EXISTS idx_markets_end_time ON markets(end_time);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);

-- Market Options
CREATE INDEX IF NOT EXISTS idx_market_options_market_id ON market_options(market_id);

-- Signals (CRITICAL for 1-wallet-1-vote enforcement)
CREATE INDEX IF NOT EXISTS idx_signals_market_id ON signals(market_id);
CREATE INDEX IF NOT EXISTS idx_signals_user_wallet ON signals(user_wallet);
CREATE INDEX IF NOT EXISTS idx_signals_option_id ON signals(option_id);

-- Yield Records
CREATE INDEX IF NOT EXISTS idx_yield_records_market_id ON yield_records(market_id);
CREATE INDEX IF NOT EXISTS idx_yield_records_recorded_at ON yield_records(recorded_at);

-- Fee Distributions
CREATE INDEX IF NOT EXISTS idx_fee_distributions_market_id ON fee_distributions(market_id);

-- Gookie Penalties
CREATE INDEX IF NOT EXISTS idx_gookie_penalties_gookie_id ON gookie_penalties(gookie_id);

-- Comments
CREATE INDEX IF NOT EXISTS idx_comments_market_id ON comments(market_id);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE gookies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gookie_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE yield_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gookie_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read gookies" ON gookies FOR SELECT USING (true);
CREATE POLICY "Public read gookie_bids" ON gookie_bids FOR SELECT USING (true);
CREATE POLICY "Public read markets" ON markets FOR SELECT USING (true);
CREATE POLICY "Public read market_options" ON market_options FOR SELECT USING (true);
CREATE POLICY "Public read signals" ON signals FOR SELECT USING (true);
CREATE POLICY "Public read yield_records" ON yield_records FOR SELECT USING (true);
CREATE POLICY "Public read fee_distributions" ON fee_distributions FOR SELECT USING (true);
CREATE POLICY "Public read gookie_penalties" ON gookie_penalties FOR SELECT USING (true);
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Public read comments" ON comments FOR SELECT USING (true);

-- Insert policies (authenticated only)
CREATE POLICY "Auth insert gookie_bids" ON gookie_bids FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth insert signals" ON signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth insert comments" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Auth insert users" ON users FOR INSERT WITH CHECK (true);

-- Update policies
CREATE POLICY "Public update markets" ON markets FOR UPDATE USING (true);
CREATE POLICY "Public update gookies" ON gookies FOR UPDATE USING (true);
CREATE POLICY "Public update signals" ON signals FOR UPDATE USING (true);
CREATE POLICY "Public update users" ON users FOR UPDATE USING (true);

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================

-- Function: Update market signal counts when new signal is inserted
CREATE OR REPLACE FUNCTION update_market_signal_counts()
RETURNS TRIGGER AS $$
BEGIN
  -- Update market totals
  UPDATE markets
  SET 
    total_signals = total_signals + 1,
    total_sol_locked = total_sol_locked + NEW.sol_amount,
    updated_at = NOW()
  WHERE id = NEW.market_id;
  
  -- Update option counts if this is a multi-option market
  IF NEW.option_id IS NOT NULL THEN
    UPDATE market_options
    SET 
      yes_signals = CASE WHEN NEW.signal_direction = 'yes' THEN yes_signals + 1 ELSE yes_signals END,
      no_signals = CASE WHEN NEW.signal_direction = 'no' THEN no_signals + 1 ELSE no_signals END,
      total_sol_on_option = total_sol_on_option + NEW.sol_amount
    WHERE id = NEW.option_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_market_signal_counts IS 'Auto-updates market and option signal counts when user signals';

-- Trigger: Update counts after signal insert
DROP TRIGGER IF EXISTS trigger_update_market_signal_counts ON signals;
CREATE TRIGGER trigger_update_market_signal_counts
AFTER INSERT ON signals
FOR EACH ROW
EXECUTE FUNCTION update_market_signal_counts();

-- Function: Update user stats after signal
CREATE OR REPLACE FUNCTION update_user_signal_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment user's signal count
  UPDATE users
  SET total_signals_made = total_signals_made + 1
  WHERE wallet_address = NEW.user_wallet;
  
  -- Create user if doesn't exist
  INSERT INTO users (wallet_address, total_signals_made)
  VALUES (NEW.user_wallet, 1)
  ON CONFLICT (wallet_address) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update user stats
DROP TRIGGER IF EXISTS trigger_update_user_signal_stats ON signals;
CREATE TRIGGER trigger_update_user_signal_stats
AFTER INSERT ON signals
FOR EACH ROW
EXECUTE FUNCTION update_user_signal_stats();

-- Function: Update highest bid for Gookie auction
CREATE OR REPLACE FUNCTION update_gookie_highest_bid()
RETURNS TRIGGER AS $$
BEGIN
  -- Update gookie with new highest bid
  UPDATE gookies
  SET 
    winning_bid_rfrm = NEW.bid_amount_rfrm,
    winner_wallet = NEW.bidder_wallet,
    updated_at = NOW()
  WHERE id = NEW.gookie_id
    AND (winning_bid_rfrm IS NULL OR NEW.bid_amount_rfrm > winning_bid_rfrm)
    AND status = 'auction';
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Update highest bid
DROP TRIGGER IF EXISTS trigger_update_gookie_highest_bid ON gookie_bids;
CREATE TRIGGER trigger_update_gookie_highest_bid
AFTER INSERT ON gookie_bids
FOR EACH ROW
EXECUTE FUNCTION update_gookie_highest_bid();

-- Function: Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers: Auto-update timestamps
DROP TRIGGER IF EXISTS update_gookies_updated_at ON gookies;
CREATE TRIGGER update_gookies_updated_at
BEFORE UPDATE ON gookies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
BEFORE UPDATE ON markets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
