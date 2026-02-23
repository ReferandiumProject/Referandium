-- =========================================================================================
-- MIGRATION: CREATE GOOKIES AUCTION SYSTEM
-- =========================================================================================

-- 1. Create gookies table
CREATE TABLE IF NOT EXISTS public.gookies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  starting_bid NUMERIC NOT NULL DEFAULT 0.01,
  current_highest_bid NUMERIC DEFAULT 0,
  highest_bidder_wallet TEXT,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'closed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  creator_wallet TEXT NOT NULL
);

-- 2. Create gookie_bids table
CREATE TABLE IF NOT EXISTS public.gookie_bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gookie_id UUID NOT NULL REFERENCES public.gookies(id) ON DELETE CASCADE,
  user_wallet TEXT NOT NULL,
  bid_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gookies_status ON public.gookies(status);
CREATE INDEX IF NOT EXISTS idx_gookies_end_time ON public.gookies(end_time);
CREATE INDEX IF NOT EXISTS idx_gookie_bids_gookie_id ON public.gookie_bids(gookie_id);
CREATE INDEX IF NOT EXISTS idx_gookie_bids_user_wallet ON public.gookie_bids(user_wallet);
CREATE INDEX IF NOT EXISTS idx_gookie_bids_created_at ON public.gookie_bids(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.gookies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gookie_bids ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for gookies
-- Everyone can read gookies
CREATE POLICY "Enable read access for all users on gookies"
  ON public.gookies FOR SELECT
  USING (true);

-- Only authenticated users (admins) can insert/update gookies
CREATE POLICY "Enable insert access for authenticated users on gookies"
  ON public.gookies FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users on gookies"
  ON public.gookies FOR UPDATE
  USING (auth.role() = 'authenticated');

-- 6. RLS Policies for gookie_bids
-- Everyone can read bids
CREATE POLICY "Enable read access for all users on gookie_bids"
  ON public.gookie_bids FOR SELECT
  USING (true);

-- Authenticated users can insert bids
CREATE POLICY "Enable insert access for authenticated users on gookie_bids"
  ON public.gookie_bids FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 7. Trigger Function to update current_highest_bid on new bid
CREATE OR REPLACE FUNCTION public.update_gookie_highest_bid()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the gookie with the new highest bid and bidder
  UPDATE public.gookies
  SET 
    current_highest_bid = NEW.bid_amount,
    highest_bidder_wallet = NEW.user_wallet
  WHERE id = NEW.gookie_id
    AND (current_highest_bid IS NULL OR NEW.bid_amount > current_highest_bid)
    AND status = 'active';
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create Trigger
DROP TRIGGER IF EXISTS trigger_update_gookie_highest_bid ON public.gookie_bids;
CREATE TRIGGER trigger_update_gookie_highest_bid
AFTER INSERT ON public.gookie_bids
FOR EACH ROW
EXECUTE FUNCTION public.update_gookie_highest_bid();

-- 9. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
