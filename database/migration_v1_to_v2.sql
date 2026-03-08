-- ============================================
-- MIGRATION: V1 (Prediction Market) → V2 (Signal-Based Yield Sharing)
-- ============================================
-- ⚠️ WARNING: This migration involves breaking changes
-- BACKUP YOUR DATABASE BEFORE RUNNING
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Rename existing tables (preserve data temporarily)
-- ============================================

-- Rename old tables to _old suffix
ALTER TABLE IF EXISTS votes RENAME TO votes_old;
ALTER TABLE IF EXISTS vote_history RENAME TO vote_history_old;
ALTER TABLE IF EXISTS markets RENAME TO markets_old;
ALTER TABLE IF EXISTS market_options RENAME TO market_options_old;

-- Keep: gookies, gookie_bids, users, comments (will be modified)

-- ============================================
-- STEP 2: Modify GOOKIES table structure
-- ============================================

-- Add new columns for RFRM and NFT tracking
ALTER TABLE gookies 
  ADD COLUMN IF NOT EXISTS starting_bid_rfrm NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS winning_bid_rfrm NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nft_mint_address TEXT,
  ADD COLUMN IF NOT EXISTS rfrm_locked_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_slashed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS slash_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slash_reason TEXT,
  ADD COLUMN IF NOT EXISTS slash_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_earned_rfrm NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_paid BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auction_start_time TIMESTAMPTZ DEFAULT NOW();

-- Rename columns
ALTER TABLE gookies RENAME COLUMN starting_bid TO starting_bid_old;
ALTER TABLE gookies RENAME COLUMN current_highest_bid TO current_highest_bid_old;
ALTER TABLE gookies RENAME COLUMN highest_bidder_wallet TO winner_wallet;
ALTER TABLE gookies RENAME COLUMN end_time TO auction_end_time;

-- Update status column constraint
ALTER TABLE gookies DROP CONSTRAINT IF EXISTS gookies_status_check;
ALTER TABLE gookies 
  ADD CONSTRAINT gookies_status_check 
  CHECK (status IN ('auction', 'won', 'market_active', 'market_closed', 'penalized', 'completed'));

-- Migrate data: convert SOL bids to RFRM (1:1 ratio for migration)
UPDATE gookies 
SET 
  starting_bid_rfrm = COALESCE(starting_bid_old, 0.01) * 100, -- Assume 1 SOL = 100 RFRM
  winning_bid_rfrm = COALESCE(current_highest_bid_old, 0) * 100,
  rfrm_locked_amount = COALESCE(current_highest_bid_old, 0) * 100;

-- Update status values
UPDATE gookies SET status = 'auction' WHERE status = 'active';
UPDATE gookies SET status = 'market_closed' WHERE status = 'closed';
UPDATE gookies SET status = 'completed' WHERE status = 'deployed';

-- ============================================
-- STEP 3: Modify GOOKIE_BIDS table
-- ============================================

-- Add RFRM amount column
ALTER TABLE gookie_bids 
  ADD COLUMN IF NOT EXISTS bid_amount_rfrm NUMERIC;

-- Rename old column
ALTER TABLE gookie_bids RENAME COLUMN bid_amount TO bid_amount_sol_old;
ALTER TABLE gookie_bids RENAME COLUMN user_wallet TO bidder_wallet;
ALTER TABLE gookie_bids ADD COLUMN IF NOT EXISTS transaction_signature TEXT;

-- Migrate: convert SOL bids to RFRM
UPDATE gookie_bids 
SET bid_amount_rfrm = bid_amount_sol_old * 100; -- 1 SOL = 100 RFRM

-- Make RFRM column NOT NULL after migration
ALTER TABLE gookie_bids ALTER COLUMN bid_amount_rfrm SET NOT NULL;

-- ============================================
-- STEP 4: Create NEW MARKETS table with signal-based structure
-- ============================================

CREATE TABLE markets_new (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Other',
  image_url TEXT,
  market_type TEXT NOT NULL DEFAULT 'binary' CHECK (market_type IN ('binary', 'multiple')),
  gookie_id UUID REFERENCES gookies(id) ON DELETE SET NULL,
  gookie_wallet TEXT,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  total_signals INTEGER DEFAULT 0,
  total_sol_locked NUMERIC DEFAULT 0,
  total_yield_earned NUMERIC DEFAULT 0,
  platform_fee_collected NUMERIC DEFAULT 0,
  gookie_fee_earned NUMERIC DEFAULT 0,
  user_share_distributed NUMERIC DEFAULT 0,
  buyback_burn_amount NUMERIC DEFAULT 0,
  min_signal_sol NUMERIC DEFAULT 0.05,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate data from old markets table
INSERT INTO markets_new (
  id, title, description, category, image_url, 
  market_type, end_time, status, created_at
)
SELECT 
  id,
  COALESCE(title, question) as title, -- Use title or question
  description,
  COALESCE(category, 'Other'),
  image_url,
  CASE 
    WHEN EXISTS (SELECT 1 FROM market_options_old WHERE market_id = markets_old.id) 
    THEN 'multiple' 
    ELSE 'binary' 
  END as market_type,
  NOW() + INTERVAL '30 days' as end_time, -- Default end time
  CASE 
    WHEN status = 'active' THEN 'active'
    WHEN status = 'closed' THEN 'closed'
    WHEN status = 'resolved' THEN 'closed'
    ELSE 'draft'
  END as status,
  created_at
FROM markets_old;

-- Link markets to gookies where possible
UPDATE markets_new m
SET gookie_id = g.id, gookie_wallet = g.winner_wallet
FROM gookies g
WHERE g.market_id = m.id;

-- ============================================
-- STEP 5: Create NEW MARKET_OPTIONS table
-- ============================================

CREATE TABLE market_options_new (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets_new(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  yes_signals INTEGER DEFAULT 0,
  no_signals INTEGER DEFAULT 0,
  total_sol_on_option NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate options
INSERT INTO market_options_new (id, market_id, title, yes_signals, no_signals, created_at)
SELECT 
  id,
  market_id,
  title,
  COALESCE(yes_count, 0),
  COALESCE(no_count, 0),
  created_at
FROM market_options_old;

-- ============================================
-- STEP 6: Create SIGNALS table (from votes)
-- ============================================

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets_new(id) ON DELETE CASCADE,
  option_id UUID REFERENCES market_options_new(id) ON DELETE CASCADE,
  user_wallet TEXT NOT NULL,
  signal_direction TEXT NOT NULL CHECK (signal_direction IN ('yes', 'no')),
  sol_amount NUMERIC NOT NULL CHECK (sol_amount >= 0.05),
  yield_earned NUMERIC DEFAULT 0,
  principal_returned BOOLEAN DEFAULT FALSE,
  yield_claimed BOOLEAN DEFAULT FALSE,
  deposit_tx_signature TEXT,
  withdrawal_tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ
);

-- Migrate votes to signals (keeping only FIRST vote per wallet per market for 1-vote rule)
WITH first_votes AS (
  SELECT DISTINCT ON (market_id, user_wallet)
    id, market_id, option_id, user_wallet, vote_direction, amount_sol, 
    transaction_signature, created_at
  FROM votes_old
  ORDER BY market_id, user_wallet, created_at ASC
)
INSERT INTO signals (
  id, market_id, option_id, user_wallet, signal_direction, 
  sol_amount, deposit_tx_signature, created_at
)
SELECT 
  id,
  market_id,
  option_id,
  user_wallet,
  vote_direction,
  GREATEST(amount_sol, 0.05) as sol_amount, -- Ensure minimum 0.05 SOL
  transaction_signature,
  created_at
FROM first_votes;

-- Create UNIQUE index to enforce 1-wallet-1-vote
CREATE UNIQUE INDEX idx_signals_one_vote_per_market 
  ON signals(market_id, user_wallet);

-- Update market signal counts
UPDATE markets_new m
SET 
  total_signals = (SELECT COUNT(*) FROM signals WHERE market_id = m.id),
  total_sol_locked = (SELECT COALESCE(SUM(sol_amount), 0) FROM signals WHERE market_id = m.id);

-- ============================================
-- STEP 7: Create NEW tables (no old data)
-- ============================================

CREATE TABLE yield_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets_new(id) ON DELETE CASCADE,
  yield_amount NUMERIC NOT NULL,
  yield_source TEXT,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets_new(id) ON DELETE CASCADE,
  total_yield NUMERIC NOT NULL,
  platform_fee NUMERIC NOT NULL,
  gookie_fee NUMERIC NOT NULL,
  user_share NUMERIC NOT NULL,
  buyback_burn NUMERIC NOT NULL,
  gookie_fee_rfrm NUMERIC,
  gookie_payment_tx TEXT,
  rfrm_bought NUMERIC,
  rfrm_burn_tx TEXT,
  distribution_complete BOOLEAN DEFAULT FALSE,
  distributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gookie_penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gookie_id UUID NOT NULL REFERENCES gookies(id) ON DELETE CASCADE,
  gookie_wallet TEXT NOT NULL,
  penalty_type TEXT NOT NULL CHECK (penalty_type IN ('early_abandonment', 'misbehavior', 'platform_seizure')),
  original_locked_rfrm NUMERIC NOT NULL,
  penalty_amount_rfrm NUMERIC NOT NULL,
  returned_amount_rfrm NUMERIC DEFAULT 0,
  reason TEXT NOT NULL,
  time_elapsed_days INTEGER,
  total_expected_days INTEGER,
  market_id UUID REFERENCES markets_new(id),
  penalty_tx_signature TEXT,
  penalized_at TIMESTAMPTZ DEFAULT NOW(),
  executed_by_wallet TEXT NOT NULL
);

-- ============================================
-- STEP 8: Update USERS table
-- ============================================

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS total_signals_made INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_yield_earned NUMERIC DEFAULT 0;

-- Populate signal counts
UPDATE users u
SET total_signals_made = (
  SELECT COUNT(*) FROM signals WHERE user_wallet = u.wallet_address
);

-- ============================================
-- STEP 9: Drop old tables and rename new ones
-- ============================================

DROP TABLE IF EXISTS votes_old CASCADE;
DROP TABLE IF EXISTS vote_history_old CASCADE;
DROP TABLE IF EXISTS markets_old CASCADE;
DROP TABLE IF EXISTS market_options_old CASCADE;

ALTER TABLE markets_new RENAME TO markets;
ALTER TABLE market_options_new RENAME TO market_options;

-- ============================================
-- STEP 10: Create all indexes
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

-- Signals
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
-- STEP 11: Recreate triggers with new functions
-- ============================================

-- Drop old triggers and functions
DROP TRIGGER IF EXISTS trigger_update_market_stats ON votes;
DROP TRIGGER IF EXISTS trigger_create_vote_snapshot ON votes;
DROP FUNCTION IF EXISTS update_market_stats();
DROP FUNCTION IF EXISTS create_vote_snapshot();

-- Create new trigger functions (from schema_v2)
CREATE OR REPLACE FUNCTION update_market_signal_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE markets
  SET 
    total_signals = total_signals + 1,
    total_sol_locked = total_sol_locked + NEW.sol_amount,
    updated_at = NOW()
  WHERE id = NEW.market_id;
  
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

CREATE TRIGGER trigger_update_market_signal_counts
AFTER INSERT ON signals
FOR EACH ROW
EXECUTE FUNCTION update_market_signal_counts();

CREATE OR REPLACE FUNCTION update_user_signal_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET total_signals_made = total_signals_made + 1
  WHERE wallet_address = NEW.user_wallet;
  
  INSERT INTO users (wallet_address, total_signals_made)
  VALUES (NEW.user_wallet, 1)
  ON CONFLICT (wallet_address) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_signal_stats
AFTER INSERT ON signals
FOR EACH ROW
EXECUTE FUNCTION update_user_signal_stats();

-- Gookie bid trigger (updated)
CREATE OR REPLACE FUNCTION update_gookie_highest_bid()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trigger_update_gookie_highest_bid ON gookie_bids;
CREATE TRIGGER trigger_update_gookie_highest_bid
AFTER INSERT ON gookie_bids
FOR EACH ROW
EXECUTE FUNCTION update_gookie_highest_bid();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
-- STEP 12: Update RLS policies
-- ============================================

-- Drop old policies
DROP POLICY IF EXISTS "Public read access for markets" ON markets;
DROP POLICY IF EXISTS "Public read access for market_options" ON market_options;
DROP POLICY IF EXISTS "Public read access for votes" ON votes;
DROP POLICY IF EXISTS "Public read access for vote_history" ON vote_history;
DROP POLICY IF EXISTS "Authenticated users can insert votes" ON votes;
DROP POLICY IF EXISTS "System can insert vote_history" ON vote_history;
DROP POLICY IF EXISTS "Public can update markets" ON markets;
DROP POLICY IF EXISTS "Public can update market_options" ON market_options;

-- Enable RLS on new tables
ALTER TABLE yield_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gookie_penalties ENABLE ROW LEVEL SECURITY;

-- Create new policies
CREATE POLICY "Public read markets" ON markets FOR SELECT USING (true);
CREATE POLICY "Public read market_options" ON market_options FOR SELECT USING (true);
CREATE POLICY "Public read signals" ON signals FOR SELECT USING (true);
CREATE POLICY "Public read yield_records" ON yield_records FOR SELECT USING (true);
CREATE POLICY "Public read fee_distributions" ON fee_distributions FOR SELECT USING (true);
CREATE POLICY "Public read gookie_penalties" ON gookie_penalties FOR SELECT USING (true);

CREATE POLICY "Auth insert signals" ON signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update markets" ON markets FOR UPDATE USING (true);
CREATE POLICY "Public update gookies" ON gookies FOR UPDATE USING (true);
CREATE POLICY "Public update signals" ON signals FOR UPDATE USING (true);

-- ============================================
-- STEP 13: Refresh schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary of changes:
-- ✅ Renamed votes → signals (enforced 1-wallet-1-vote)
-- ✅ Removed prediction market columns (outcome, yes_pool, no_pool)
-- ✅ Added RFRM token tracking to gookies
-- ✅ Added yield and fee distribution tracking
-- ✅ Added gookie penalty/slash system
-- ✅ Linked markets to gookies
-- ✅ Updated all triggers and functions
-- ============================================
