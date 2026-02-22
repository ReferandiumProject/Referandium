# Referandium Database Setup

## Overview
This document provides instructions for setting up the complete Supabase database schema for the Referandium project.

## Prerequisites
- Supabase account and project
- Database connection credentials

## Database Architecture

### Tables

1. **markets** - Main prediction markets
   - Stores market information, voting statistics, and status
   - Auto-updates via triggers when votes are cast

2. **market_options** - Multi-option market choices
   - Linked to markets via foreign key
   - Tracks individual option statistics

3. **votes** - User voting records
   - Stores all user votes with transaction details
   - Links to both markets and options (optional)

4. **vote_history** - Time-series data for charts
   - Automatically populated by triggers after each vote
   - Provides historical percentage and volume data

5. **comments** - Market discussion system
   - User comments linked to specific markets
   - Supports threaded discussions

### Key Features

#### Automatic Updates via Triggers
The database includes PostgreSQL triggers that automatically:
- Update market/option statistics when votes are cast
- Create historical snapshots for chart data
- Maintain data consistency across tables

#### Row Level Security (RLS)
- Public read access for all data
- Authenticated write access for votes and comments
- Admin/system access for market updates

## Setup Instructions

### Step 1: Run the Schema
Execute the `schema.sql` file in your Supabase SQL Editor:

```bash
# Copy the contents of database/schema.sql to Supabase SQL Editor
# or use the Supabase CLI:
supabase db push
```

### Step 2: Verify Tables
Check that all tables are created:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

### Step 3: Test Triggers
Insert a test vote to verify triggers work:
```sql
-- Test vote insertion
INSERT INTO votes (market_id, user_wallet, vote_direction, amount_sol)
VALUES ('your-market-id', 'test-wallet', 'yes', 1.0);

-- Check if market stats updated
SELECT * FROM markets WHERE id = 'your-market-id';

-- Check if history snapshot created
SELECT * FROM vote_history WHERE market_id = 'your-market-id';
```

## Data Flow

### When a User Votes:

1. **Frontend Action**: User submits vote with amount
2. **Solana Transaction**: SOL sent to treasury wallet
3. **Database Insert**: Vote record created in `votes` table
4. **Trigger 1 (`update_market_stats`)**: 
   - Updates `markets.total_pool`, `yes_count`, `no_count`
   - Updates `market_options` stats if multi-option
5. **Trigger 2 (`create_vote_snapshot`)**:
   - Calculates current percentages
   - Creates snapshot in `vote_history`
6. **Frontend Refresh**: 
   - Market stats update across all pages
   - Chart displays new data point
   - Profile stats refresh

### Real-time Updates

All data updates are reflected immediately:
- **Market Cards**: Show current totals and percentages
- **Market Detail**: Live stats and updated chart
- **Profile Page**: Updated vote history and statistics
- **Comments**: New comments appear instantly

## Frontend Integration

### Environment Variables
Ensure these are set in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Key Files
- `app/components/MarketChart.tsx` - Fetches from `vote_history`
- `app/market/[id]/MarketDetailClient.tsx` - Handles voting and refresh
- `app/profile/page.tsx` - User statistics and history
- `app/components/MarketCard.tsx` - Displays live market data

## Maintenance

### Monitoring
Check database health regularly:
```sql
-- Check vote count per market
SELECT m.title, COUNT(v.id) as vote_count
FROM markets m
LEFT JOIN votes v ON m.id = v.market_id
GROUP BY m.id, m.title;

-- Check history snapshot growth
SELECT market_id, COUNT(*) as snapshots
FROM vote_history
GROUP BY market_id;
```

### Performance Optimization
- Indexes are automatically created on foreign keys
- Historical data can be archived after 90 days
- Consider partitioning `vote_history` for large datasets

## Troubleshooting

### Issue: Triggers Not Firing
```sql
-- Check trigger status
SELECT * FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- Re-create triggers if needed
DROP TRIGGER IF EXISTS trigger_update_market_stats ON votes;
-- Then re-run the trigger creation from schema.sql
```

### Issue: RLS Blocking Queries
```sql
-- Temporarily disable RLS for testing (dev only!)
ALTER TABLE markets DISABLE ROW LEVEL SECURITY;

-- Re-enable after testing
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
```

### Issue: Chart Not Showing Data
- Verify `vote_history` has data: `SELECT * FROM vote_history LIMIT 10;`
- Check console for fetch errors
- Ensure `marketId` is passed correctly to MarketChart component

## Migration from Mock Data

If you had mock data previously:
1. Backup existing data
2. Drop old tables: `DROP TABLE IF EXISTS old_table_name CASCADE;`
3. Run the new schema
4. Re-seed with production data

## Security Notes

- Never expose database credentials in frontend code
- Use Supabase anon key (public) for client-side queries
- Service role key (secret) only for admin operations
- RLS policies protect sensitive operations

## Support

For issues or questions:
- Check Supabase logs in Dashboard → Database → Logs
- Review trigger execution: `SELECT * FROM pg_stat_user_functions;`
- Contact team or check documentation
