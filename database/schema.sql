-- ============================================
-- REFERANDIUM DATABASE SCHEMA
-- ============================================

-- Markets Table (Main prediction markets)
CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  question TEXT,
  description TEXT,
  category TEXT DEFAULT 'Other',
  image_url TEXT,
  yes_count INTEGER DEFAULT 0,
  no_count INTEGER DEFAULT 0,
  yes_pool NUMERIC DEFAULT 0,
  no_pool NUMERIC DEFAULT 0,
  total_pool NUMERIC DEFAULT 0,
  outcome TEXT CHECK (outcome IN ('yes', 'no', 'unresolved')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market Options Table (For multi-option markets)
CREATE TABLE IF NOT EXISTS market_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  yes_pool NUMERIC DEFAULT 0,
  no_pool NUMERIC DEFAULT 0,
  yes_count INTEGER DEFAULT 0,
  no_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Votes Table (User voting records)
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  option_id UUID REFERENCES market_options(id) ON DELETE CASCADE,
  user_wallet TEXT NOT NULL,
  vote_direction TEXT NOT NULL CHECK (vote_direction IN ('yes', 'no')),
  amount_sol NUMERIC NOT NULL,
  transaction_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vote History Table (Time-series data for charts)
CREATE TABLE IF NOT EXISTS vote_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  option_id UUID REFERENCES market_options(id) ON DELETE CASCADE,
  yes_percentage NUMERIC DEFAULT 50,
  no_percentage NUMERIC DEFAULT 50,
  yes_pool NUMERIC DEFAULT 0,
  no_pool NUMERIC DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  snapshot_time TIMESTAMPTZ DEFAULT NOW()
);

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  user_wallet TEXT NOT NULL,
  username TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_votes_market_id ON votes(market_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_wallet ON votes(user_wallet);
CREATE INDEX IF NOT EXISTS idx_vote_history_market_id ON vote_history(market_id);
CREATE INDEX IF NOT EXISTS idx_vote_history_time ON vote_history(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_comments_market_id ON comments(market_id);
CREATE INDEX IF NOT EXISTS idx_market_options_market_id ON market_options(market_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access for markets" ON markets FOR SELECT USING (true);
CREATE POLICY "Public read access for market_options" ON market_options FOR SELECT USING (true);
CREATE POLICY "Public read access for votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Public read access for vote_history" ON vote_history FOR SELECT USING (true);
CREATE POLICY "Public read access for comments" ON comments FOR SELECT USING (true);

-- Insert policies (authenticated users only)
CREATE POLICY "Authenticated users can insert votes" ON votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can insert comments" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "System can insert vote_history" ON vote_history FOR INSERT WITH CHECK (true);

-- Update policies for markets (admin or system)
CREATE POLICY "Public can update markets" ON markets FOR UPDATE USING (true);
CREATE POLICY "Public can update market_options" ON market_options FOR UPDATE USING (true);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update market statistics after a vote
CREATE OR REPLACE FUNCTION update_market_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update market totals
  IF NEW.option_id IS NULL THEN
    -- Simple market (Yes/No only)
    UPDATE markets
    SET 
      yes_pool = CASE WHEN NEW.vote_direction = 'yes' THEN yes_pool + NEW.amount_sol ELSE yes_pool END,
      no_pool = CASE WHEN NEW.vote_direction = 'no' THEN no_pool + NEW.amount_sol ELSE no_pool END,
      total_pool = total_pool + NEW.amount_sol,
      yes_count = CASE WHEN NEW.vote_direction = 'yes' THEN yes_count + 1 ELSE yes_count END,
      no_count = CASE WHEN NEW.vote_direction = 'no' THEN no_count + 1 ELSE no_count END,
      updated_at = NOW()
    WHERE id = NEW.market_id;
  ELSE
    -- Multi-option market
    UPDATE market_options
    SET 
      yes_pool = CASE WHEN NEW.vote_direction = 'yes' THEN yes_pool + NEW.amount_sol ELSE yes_pool END,
      no_pool = CASE WHEN NEW.vote_direction = 'no' THEN no_pool + NEW.amount_sol ELSE no_pool END,
      yes_count = CASE WHEN NEW.vote_direction = 'yes' THEN yes_count + 1 ELSE yes_count END,
      no_count = CASE WHEN NEW.vote_direction = 'no' THEN no_count + 1 ELSE no_count END
    WHERE id = NEW.option_id;
    
    -- Update market total pool
    UPDATE markets
    SET 
      total_pool = total_pool + NEW.amount_sol,
      updated_at = NOW()
    WHERE id = NEW.market_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update stats after each vote
DROP TRIGGER IF EXISTS trigger_update_market_stats ON votes;
CREATE TRIGGER trigger_update_market_stats
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION update_market_stats();

-- Function to create vote history snapshot
CREATE OR REPLACE FUNCTION create_vote_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  total_yes NUMERIC;
  total_no NUMERIC;
  total NUMERIC;
  yes_pct NUMERIC;
  no_pct NUMERIC;
BEGIN
  IF NEW.option_id IS NULL THEN
    -- Simple market snapshot
    SELECT yes_pool, no_pool, total_pool INTO total_yes, total_no, total
    FROM markets WHERE id = NEW.market_id;
    
    IF total > 0 THEN
      yes_pct := (total_yes / total) * 100;
      no_pct := (total_no / total) * 100;
    ELSE
      yes_pct := 50;
      no_pct := 50;
    END IF;
    
    INSERT INTO vote_history (market_id, yes_percentage, no_percentage, yes_pool, no_pool, total_volume)
    VALUES (NEW.market_id, yes_pct, no_pct, total_yes, total_no, total);
  ELSE
    -- Multi-option snapshot
    SELECT yes_pool, no_pool INTO total_yes, total_no
    FROM market_options WHERE id = NEW.option_id;
    
    total := total_yes + total_no;
    
    IF total > 0 THEN
      yes_pct := (total_yes / total) * 100;
      no_pct := (total_no / total) * 100;
    ELSE
      yes_pct := 50;
      no_pct := 50;
    END IF;
    
    INSERT INTO vote_history (market_id, option_id, yes_percentage, no_percentage, yes_pool, no_pool, total_volume)
    VALUES (NEW.market_id, NEW.option_id, yes_pct, no_pct, total_yes, total_no, total);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create snapshot after each vote
DROP TRIGGER IF EXISTS trigger_create_vote_snapshot ON votes;
CREATE TRIGGER trigger_create_vote_snapshot
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION create_vote_snapshot();
