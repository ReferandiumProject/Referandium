ALTER TABLE graduations
ADD COLUMN IF NOT EXISTS pool_price numeric(40,20),
ADD COLUMN IF NOT EXISTS pool_price_read_at timestamptz;
