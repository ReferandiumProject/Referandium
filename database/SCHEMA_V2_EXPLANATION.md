# 📊 Referandium V2 Schema - Complete Redesign Documentation

## 🎯 Executive Summary

**Old Model:** Prediction market (win/lose, betting, outcomes)  
**New Model:** Signal-based yield sharing (opinions, SOL deposits, everyone gets principal back + yield)

**Core Change:** Removed all win/lose mechanics. Users signal opinions by depositing SOL, earn yield proportionally, and get their SOL back when market closes.

---

## 🔄 Key Paradigm Shifts

### 1. **Votes → Signals**
- **OLD:** Users "vote" by betting SOL (win or lose based on outcome)
- **NEW:** Users "signal" opinion by depositing SOL (always get it back + yield)

### 2. **Outcomes Removed**
- **OLD:** Markets "resolve" to YES/NO/UNRESOLVED outcome, winners get rewards
- **NEW:** Markets simply "close" at end date, no resolution concept

### 3. **Pool Tracking Changed**
- **OLD:** `yes_pool` / `no_pool` (betting pools)
- **NEW:** `total_sol_locked` (escrow for yield generation) + `total_signals` (count)

### 4. **1 Wallet = 1 Vote (Strictly Enforced)**
- **OLD:** Users could vote multiple times
- **NEW:** Database unique constraint prevents multiple signals per market
  ```sql
  CREATE UNIQUE INDEX idx_signals_one_vote_per_market 
    ON signals(market_id, user_wallet);
  ```

### 5. **RFRM Token Integration**
- **OLD:** Gookie bids in SOL
- **NEW:** Gookie bids in RFRM tokens
- Gookie fees paid in RFRM (swapped from SOL yield via Jupiter)
- 5% of yield used for RFRM buyback & burn

### 6. **Gookie-Market Relationship**
- **OLD:** Markets exist independently
- **NEW:** Each market has a `gookie_id` and `gookie_wallet` (manager relationship)

---

## 📋 Table-by-Table Changes

### **1. GOOKIES Table**

#### Changes Made:
```sql
-- ADDED columns:
- starting_bid_rfrm (NUMERIC) - Starting bid in RFRM tokens
- winning_bid_rfrm (NUMERIC) - Winning bid amount in RFRM
- nft_mint_address (TEXT) - NFT granting market creation rights
- rfrm_locked_amount (NUMERIC) - RFRM locked when won
- is_slashed (BOOLEAN) - Penalty flag
- slash_amount (NUMERIC) - RFRM seized
- slash_reason (TEXT) - Why penalized
- slash_date (TIMESTAMPTZ) - When penalized
- fee_earned_rfrm (NUMERIC) - RFRM fee earned after market closes
- fee_paid (BOOLEAN) - Fee distribution status
- auction_start_time (TIMESTAMPTZ) - When auction started

-- RENAMED columns:
- starting_bid → starting_bid_old (deprecated)
- current_highest_bid → current_highest_bid_old (deprecated)
- highest_bidder_wallet → winner_wallet
- end_time → auction_end_time

-- UPDATED status enum:
OLD: 'active', 'closed', 'deployed'
NEW: 'auction', 'won', 'market_active', 'market_closed', 'penalized', 'completed'
```

#### Why:
- **RFRM tracking:** Gookie auctions now use RFRM tokens, not SOL
- **NFT system:** Winners receive NFT proving market creation rights
- **Penalty system:** Track slashing for early abandonment or misbehavior
- **Fee tracking:** Gookies earn 30% of yield in RFRM (paid after market closes)
- **Lifecycle tracking:** More granular status for Gookie journey

---

### **2. GOOKIE_BIDS Table**

#### Changes Made:
```sql
-- ADDED columns:
- bid_amount_rfrm (NUMERIC NOT NULL) - Bid in RFRM tokens
- transaction_signature (TEXT) - Blockchain proof

-- RENAMED columns:
- bid_amount → bid_amount_sol_old (deprecated)
- user_wallet → bidder_wallet
```

#### Why:
- **RFRM bids only:** All Gookie auction bids are in RFRM tokens
- **Blockchain proof:** Track Solana transaction signatures for verification

---

### **3. MARKETS Table**

#### Changes Made:
```sql
-- ADDED columns:
- market_type (TEXT) - 'binary' or 'multiple'
- gookie_id (UUID FK) - Which Gookie manages this market
- gookie_wallet (TEXT) - Gookie's wallet address
- start_time (TIMESTAMPTZ) - Market start time
- total_signals (INTEGER) - Number of unique wallets that signaled
- total_sol_locked (NUMERIC) - SOL in escrow for yield
- total_yield_earned (NUMERIC) - Yield generated during market
- platform_fee_collected (NUMERIC) - 20% of yield
- gookie_fee_earned (NUMERIC) - 30% of yield
- user_share_distributed (NUMERIC) - 45% of yield
- buyback_burn_amount (NUMERIC) - 5% of yield for RFRM buyback
- min_signal_sol (NUMERIC) - Minimum SOL to signal (default 0.05)

-- REMOVED columns:
- yes_pool ❌ (prediction market concept)
- no_pool ❌ (prediction market concept)
- yes_count ❌ (replaced by option-level tracking)
- no_count ❌ (replaced by option-level tracking)
- outcome ❌ ('yes', 'no', 'unresolved' - no longer relevant)
- question (merged into title)

-- UPDATED status enum:
OLD: 'active', 'closed', 'resolved'
NEW: 'draft', 'active', 'closed'
```

#### Why:
- **No win/lose:** Removed all outcome-based columns
- **Gookie ownership:** Every market is managed by a Gookie
- **Yield tracking:** Track all yield and fee distributions
- **Signal counting:** Count wallets (1 vote each), not SOL amounts
- **Draft status:** Gookies can prepare market before going live

---

### **4. MARKET_OPTIONS Table**

#### Changes Made:
```sql
-- ADDED columns:
- yes_signals (INTEGER) - Count of YES signals on this option
- no_signals (INTEGER) - Count of NO signals on this option
- total_sol_on_option (NUMERIC) - SOL deposited on this option

-- REMOVED columns:
- yes_pool ❌ (prediction market concept)
- no_pool ❌ (prediction market concept)
- yes_count → yes_signals (renamed for clarity)
- no_count → no_signals (renamed for clarity)
```

#### Why:
- **Signal terminology:** Renamed to match new paradigm
- **SOL tracking:** Track deposited SOL (for yield calculation), not betting pools

---

### **5. VOTES → SIGNALS Table** ⭐ Major Rename

#### Changes Made:
```sql
-- TABLE RENAMED: votes → signals

-- ADDED columns:
- yield_earned (NUMERIC) - User's share of yield from this signal
- principal_returned (BOOLEAN) - Has SOL been returned
- yield_claimed (BOOLEAN) - Has yield been distributed
- deposit_tx_signature (TEXT) - Tx when SOL deposited
- withdrawal_tx_signature (TEXT) - Tx when SOL + yield returned
- withdrawn_at (TIMESTAMPTZ) - When user withdrew

-- RENAMED columns:
- vote_direction → signal_direction
- amount_sol → sol_amount

-- ADDED constraint:
- sol_amount CHECK (sol_amount >= 0.05) - Minimum 0.05 SOL

-- ADDED unique index (CRITICAL):
CREATE UNIQUE INDEX idx_signals_one_vote_per_market 
  ON signals(market_id, user_wallet);
```

#### Why:
- **1 wallet = 1 vote enforcement:** Unique index prevents multiple signals per market
- **Yield tracking:** Track earned yield per user per market
- **Return tracking:** Track when principal + yield returned to user
- **Blockchain proof:** Both deposit and withdrawal signatures
- **Terminology:** "Signal" better reflects opinion expression (not betting)

---

### **6. YIELD_RECORDS Table** 🆕 New Table

```sql
CREATE TABLE yield_records (
  id UUID PRIMARY KEY,
  market_id UUID FK,
  yield_amount NUMERIC NOT NULL,
  yield_source TEXT, -- 'staking', 'lending', etc.
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Why:
- **Yield auditing:** Historical record of all yield generated per market
- **Source tracking:** Know where yield came from (Marinade, Kamino, etc.)
- **Period tracking:** Time-based yield calculation

---

### **7. FEE_DISTRIBUTIONS Table** 🆕 New Table

```sql
CREATE TABLE fee_distributions (
  id UUID PRIMARY KEY,
  market_id UUID FK,
  total_yield NUMERIC NOT NULL,
  platform_fee NUMERIC NOT NULL,      -- 20%
  gookie_fee NUMERIC NOT NULL,        -- 30%
  user_share NUMERIC NOT NULL,        -- 45%
  buyback_burn NUMERIC NOT NULL,      -- 5%
  gookie_fee_rfrm NUMERIC,            -- RFRM sent to Gookie
  gookie_payment_tx TEXT,
  rfrm_bought NUMERIC,                -- RFRM bought for burn
  rfrm_burn_tx TEXT,
  distribution_complete BOOLEAN,
  distributed_at TIMESTAMPTZ
);
```

#### Why:
- **Fee transparency:** Track exact fee breakdown per market
- **RFRM swaps:** Track SOL→RFRM conversions via Jupiter
- **Burn tracking:** Proof of RFRM buyback & burn (5% of yield)
- **Audit trail:** Complete history of all distributions

**Fee Distribution Formula:**
```
Total Yield = X SOL (earned from staking/lending)

Platform:      20% of X = 0.20X SOL
Gookie:        30% of X = 0.30X SOL → swapped to RFRM via Jupiter
Users:         45% of X = 0.45X SOL (distributed proportionally by deposit amount)
Buyback & Burn: 5% of X = 0.05X SOL → buy RFRM → burn
```

---

### **8. GOOKIE_PENALTIES Table** 🆕 New Table

```sql
CREATE TABLE gookie_penalties (
  id UUID PRIMARY KEY,
  gookie_id UUID FK,
  gookie_wallet TEXT NOT NULL,
  penalty_type TEXT CHECK (IN 'early_abandonment', 'misbehavior', 'platform_seizure'),
  original_locked_rfrm NUMERIC NOT NULL,
  penalty_amount_rfrm NUMERIC NOT NULL,
  returned_amount_rfrm NUMERIC DEFAULT 0,
  reason TEXT NOT NULL,
  time_elapsed_days INTEGER,
  total_expected_days INTEGER,
  market_id UUID FK,
  penalty_tx_signature TEXT,
  penalized_at TIMESTAMPTZ,
  executed_by_wallet TEXT NOT NULL
);
```

#### Why:
- **Penalty tracking:** Record all Gookie slashing events
- **Proportional penalties:** Track time-based calculations for early abandonment
- **Transparency:** Public record of all penalties with reasons
- **Platform control:** Track admin wallet that executed penalty

**Penalty Calculation Example:**
```
Gookie locks 1000 RFRM
Market duration: 30 days
Gookie abandons after 10 days

Time elapsed: 10/30 = 33%
Returned: 33% of 1000 = 330 RFRM
Penalty: 67% of 1000 = 670 RFRM seized
```

---

### **9. USERS Table**

#### Changes Made:
```sql
-- ADDED columns:
- total_signals_made (INTEGER) - Count of signals by this user
- total_yield_earned (NUMERIC) - Lifetime yield earned
```

#### Why:
- **User stats:** Track participation and earnings
- **Leaderboards:** Enable ranking by signals or yield

---

### **10. COMMENTS Table**
✅ **Unchanged** - No modifications needed

---

## 🔧 Updated Trigger Functions

### **1. `update_market_signal_counts()`** (Renamed from `update_market_stats()`)

**OLD Behavior:**
```sql
-- Updated yes_pool, no_pool, yes_count, no_count
-- Calculated win/lose pools
```

**NEW Behavior:**
```sql
-- Updates total_signals (increment by 1)
-- Updates total_sol_locked (add deposited SOL)
-- Updates option yes_signals or no_signals
-- Updates option total_sol_on_option
```

**Why Changed:**
- No more pool betting logic
- Focus on signal counting and SOL tracking for yield
- Enforces 1 wallet = 1 vote counting

---

### **2. `update_user_signal_stats()`** 🆕 New Function

**Behavior:**
```sql
-- Increments user's total_signals_made counter
-- Auto-creates user if doesn't exist
```

**Why Added:**
- Track user participation metrics
- Enable leaderboards and stats

---

### **3. `update_gookie_highest_bid()`** (Modified)

**OLD:** Updated `current_highest_bid` in SOL  
**NEW:** Updates `winning_bid_rfrm` in RFRM tokens

**Changes:**
```sql
-- OLD column: current_highest_bid
-- NEW column: winning_bid_rfrm

-- Only updates if status = 'auction' (new status value)
```

---

### **4. `create_vote_snapshot()`** ❌ Removed

**Why Removed:**
- Vote history was for tracking prediction odds over time
- Not needed in signal-based model (no odds/probabilities)
- Can be re-added later if time-series signal tracking needed

---

## 🚀 Migration Steps

### **Option 1: Clean Install (Recommended for New Projects)**

```bash
# 1. Drop existing database (⚠️ destroys all data)
# Run this in Supabase SQL Editor:
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

# 2. Run new schema
# Paste entire schema_v2_signal_based.sql into Supabase SQL Editor
# Execute
```

### **Option 2: Migrate Existing Data**

```bash
# 1. BACKUP your database first!
# Supabase Dashboard → Database → Backups → Create Backup

# 2. Run migration script
# Paste entire migration_v1_to_v2.sql into Supabase SQL Editor
# This will:
#   - Preserve existing users, comments, gookies
#   - Convert votes → signals (1 per wallet)
#   - Convert markets (remove outcome columns)
#   - Convert SOL bids → RFRM bids (1 SOL = 100 RFRM)
#   - Add all new tables
#   - Update all triggers

# 3. Verify migration
SELECT 'Signals migrated:' as info, COUNT(*) as count FROM signals
UNION ALL
SELECT 'Markets migrated:', COUNT(*) FROM markets
UNION ALL
SELECT 'Gookies updated:', COUNT(*) FROM gookies;
```

### **Data Loss Warning:**
- ❌ **Vote history** table is dropped (prediction odds no longer relevant)
- ❌ **Multiple votes per wallet** - only FIRST vote per market is kept
- ❌ **Market outcomes** - removed (no resolution concept)
- ✅ **Users preserved** - all user data intact
- ✅ **Comments preserved** - all comments intact
- ✅ **Gookies preserved** - converted to RFRM tracking

---

## 🔒 Database Constraints & Validations

### **Critical Constraints:**

1. **1 Wallet = 1 Vote:**
   ```sql
   CREATE UNIQUE INDEX idx_signals_one_vote_per_market 
     ON signals(market_id, user_wallet);
   ```

2. **Minimum Signal Amount:**
   ```sql
   CHECK (sol_amount >= 0.05)
   ```

3. **Valid Signal Direction:**
   ```sql
   CHECK (signal_direction IN ('yes', 'no'))
   ```

4. **Market Status Flow:**
   ```sql
   CHECK (status IN ('draft', 'active', 'closed'))
   -- draft → active → closed (one-way flow)
   ```

5. **Gookie Status Flow:**
   ```sql
   CHECK (status IN ('auction', 'won', 'market_active', 'market_closed', 'penalized', 'completed'))
   ```

6. **Penalty Types:**
   ```sql
   CHECK (penalty_type IN ('early_abandonment', 'misbehavior', 'platform_seizure'))
   ```

---

## 📊 Query Examples

### **Get Market Signals with User Info:**
```sql
SELECT 
  m.title,
  m.total_signals,
  m.total_sol_locked,
  m.total_yield_earned,
  u.username,
  s.signal_direction,
  s.sol_amount,
  s.yield_earned
FROM markets m
JOIN signals s ON s.market_id = m.id
JOIN users u ON u.wallet_address = s.user_wallet
WHERE m.id = 'market_uuid_here';
```

### **Calculate User's Yield Share:**
```sql
-- User's share = (user_sol / total_sol_locked) * user_pool_percentage
-- User pool = 45% of total yield

WITH market_data AS (
  SELECT 
    m.id,
    m.total_sol_locked,
    m.total_yield_earned,
    (m.total_yield_earned * 0.45) as user_pool
  FROM markets m
  WHERE m.id = 'market_uuid'
)
UPDATE signals s
SET yield_earned = (
  SELECT (s.sol_amount / md.total_sol_locked) * md.user_pool
  FROM market_data md
)
WHERE s.market_id = 'market_uuid';
```

### **Check if Wallet Can Signal:**
```sql
-- Returns TRUE if wallet can signal, FALSE if already signaled
SELECT NOT EXISTS (
  SELECT 1 FROM signals 
  WHERE market_id = 'market_uuid' 
  AND user_wallet = 'wallet_address'
) as can_signal;
```

### **Get Gookie's Earnings:**
```sql
SELECT 
  g.title,
  g.winner_wallet,
  g.winning_bid_rfrm as rfrm_locked,
  g.fee_earned_rfrm,
  g.fee_paid,
  g.is_slashed,
  g.slash_amount
FROM gookies g
WHERE g.winner_wallet = 'gookie_wallet';
```

### **Platform Fee Summary:**
```sql
SELECT 
  SUM(total_yield) as total_yield_all_markets,
  SUM(platform_fee) as platform_revenue,
  SUM(gookie_fee) as total_gookie_fees,
  SUM(user_share) as total_user_rewards,
  SUM(buyback_burn) as total_rfrm_burned
FROM fee_distributions
WHERE distribution_complete = true;
```

---

## 🎨 Frontend Integration Changes Needed

### **1. Market Creation (by Gookie):**
```typescript
// OLD:
await supabase.from('markets').insert({
  title, description, category
});

// NEW:
await supabase.from('markets').insert({
  title, description, category,
  gookie_id: gookieId, // REQUIRED
  gookie_wallet: walletAddress, // REQUIRED
  status: 'draft', // Start in draft
  end_time: endDate, // REQUIRED
  market_type: 'binary' // or 'multiple'
});
```

### **2. User Signaling (Voting):**
```typescript
// OLD: Could vote multiple times
await supabase.from('votes').insert({
  market_id, user_wallet, vote_direction, amount_sol
});

// NEW: Unique constraint enforces 1 vote
const { error } = await supabase.from('signals').insert({
  market_id, 
  user_wallet, 
  signal_direction, // 'yes' or 'no'
  sol_amount, // >= 0.05 SOL
  deposit_tx_signature // IMPORTANT: Solana tx proof
});

if (error?.code === '23505') {
  // Unique violation - user already signaled
  showError('You have already signaled on this market');
}
```

### **3. Check if User Can Signal:**
```typescript
const { data } = await supabase
  .from('signals')
  .select('id')
  .eq('market_id', marketId)
  .eq('user_wallet', walletAddress)
  .single();

const canSignal = !data; // true if no existing signal
```

### **4. Gookie Bidding (RFRM Tokens):**
```typescript
// OLD: SOL transfer
const tx = SystemProgram.transfer({
  fromPubkey, toPubkey, 
  lamports: bidAmount * LAMPORTS_PER_SOL
});

// NEW: RFRM token transfer
const tx = createTransferInstruction(
  userRfrmAccount, // Source
  treasuryRfrmAccount, // Destination
  userWallet,
  bidAmountRfrm * (10 ** RFRM_DECIMALS)
);

const signature = await sendTransaction(tx);

await supabase.from('gookie_bids').insert({
  gookie_id,
  bidder_wallet,
  bid_amount_rfrm: bidAmountRfrm,
  transaction_signature: signature
});
```

### **5. Display Market Stats:**
```typescript
// OLD:
<div>
  <p>Yes Pool: {market.yes_pool} SOL</p>
  <p>No Pool: {market.no_pool} SOL</p>
  <p>Yes %: {(yes_pool / total_pool) * 100}%</p>
</div>

// NEW:
<div>
  <p>Total Signals: {market.total_signals} wallets</p>
  <p>Total Locked: {market.total_sol_locked} SOL</p>
  <p>Yield Earned: {market.total_yield_earned} SOL</p>
  <p>Your Share: {userYieldShare} SOL</p>
</div>
```

---

## ✅ Post-Migration Checklist

- [ ] **Run schema_v2_signal_based.sql** in Supabase
- [ ] **Verify all tables created** (10 tables total)
- [ ] **Check unique index exists** on signals(market_id, user_wallet)
- [ ] **Test 1-wallet-1-vote enforcement** (try inserting duplicate signal)
- [ ] **Update frontend code** to use `signals` instead of `votes`
- [ ] **Update Gookie bidding** to use RFRM tokens
- [ ] **Add yield distribution logic** to backend
- [ ] **Integrate Jupiter swap** for SOL→RFRM conversions
- [ ] **Test fee distribution** calculations
- [ ] **Update market creation** to require gookie_id
- [ ] **Remove outcome/resolution** UI components
- [ ] **Add signal withdrawal** flow (return SOL + yield)

---

## 🔮 Future Enhancements (Not in V2)

- **Staking integration:** Auto-stake locked SOL to Marinade/Jito
- **Real-time yield tracking:** Cron job to update yield_records daily
- **Automated fee distribution:** Smart contract or backend service
- **RFRM governance:** Voting on market categories
- **Gookie NFT metadata:** Rich NFT with market stats
- **Leaderboards:** Top signalers, top yield earners, top Gookies
- **Referral system:** Share RFRM from referred users' yields

---

## 📚 Summary of All Changes

| Area | Old | New | Impact |
|------|-----|-----|--------|
| **Core Concept** | Prediction market | Signal-based yield | Complete redesign |
| **Voting** | Multiple votes allowed | 1 wallet = 1 vote | DB constraint |
| **SOL Handling** | Betting pools (win/lose) | Escrow (everyone gets back) | Fee distribution |
| **Gookie Bids** | SOL | RFRM tokens | Token integration |
| **Market Lifecycle** | Active → Resolved | Draft → Active → Closed | No resolution |
| **Fee Structure** | Winner takes all | Split: 20/30/45/5 | Yield sharing |
| **Table Names** | votes, vote_history | signals, yield_records | Terminology |
| **Outcome Tracking** | yes_pool, no_pool, outcome | total_sol_locked, yield | Removed betting |

---

**Schema Version:** 2.0.0  
**Migration Complexity:** High  
**Breaking Changes:** Yes (major)  
**Backwards Compatible:** No

**Questions?** Review the SQL files:
- `schema_v2_signal_based.sql` - Complete new schema
- `migration_v1_to_v2.sql` - Automated migration from V1
