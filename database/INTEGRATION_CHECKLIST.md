# Database Integration Checklist

## 🚀 Quick Start Guide

Follow these steps to connect your frontend to the real Supabase database.

### ✅ Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project or use existing one
3. Note your project URL and anon key

### ✅ Step 2: Run Database Schema
1. Open Supabase Dashboard → SQL Editor
2. Copy entire contents of `database/schema.sql`
3. Paste and run in SQL Editor
4. Verify success (should see "Success. No rows returned")

### ✅ Step 3: Verify Tables Created
Run this query:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Expected tables:
- ✅ comments
- ✅ market_options
- ✅ markets
- ✅ vote_history
- ✅ votes

### ✅ Step 4: Check Triggers
Run this query:
```sql
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public';
```

Expected triggers:
- ✅ trigger_update_market_stats (on votes)
- ✅ trigger_create_vote_snapshot (on votes)

### ✅ Step 5: Environment Variables
Ensure `.env.local` has:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### ✅ Step 6: Test Vote Flow

1. **Create Test Market**:
```sql
INSERT INTO markets (title, description, category, status)
VALUES ('Test Market', 'Testing database integration', 'Crypto', 'active')
RETURNING id;
```

2. **Connect Wallet** on frontend and navigate to the test market

3. **Submit Vote** with amount (e.g., 0.1 SOL)

4. **Verify Database Updates**:
```sql
-- Check vote was recorded
SELECT * FROM votes ORDER BY created_at DESC LIMIT 1;

-- Check market stats updated
SELECT id, title, yes_count, no_count, total_pool 
FROM markets WHERE title = 'Test Market';

-- Check history snapshot created
SELECT * FROM vote_history ORDER BY snapshot_time DESC LIMIT 1;
```

### ✅ Step 7: Verify Frontend Updates

After voting, check these pages refresh automatically:

1. **Market Detail Page**
   - [ ] Chart shows new data point
   - [ ] Total Volume updated
   - [ ] Yes/No percentages changed
   - [ ] Vote count increased

2. **Profile Page**
   - [ ] New vote appears in history
   - [ ] Total Spent increased
   - [ ] Vote count increased
   - [ ] Statistics updated

3. **Markets List Page**
   - [ ] Market card shows updated stats
   - [ ] Volume reflects new total
   - [ ] Participant count increased

4. **Comments Section**
   - [ ] Can post comment
   - [ ] Comment appears immediately
   - [ ] Can delete own comments

## 🔧 Troubleshooting

### Problem: Chart Shows "Loading chart..."
**Solution**: Check if vote_history has data
```sql
SELECT COUNT(*) FROM vote_history;
```
If 0, submit a test vote to trigger snapshot creation.

### Problem: Vote Doesn't Update Stats
**Solution**: Check trigger status
```sql
SELECT * FROM information_schema.triggers 
WHERE event_object_table = 'votes';
```
If missing, re-run trigger creation from schema.sql.

### Problem: Comments Not Saving
**Solution**: Check RLS policies
```sql
SELECT * FROM pg_policies WHERE tablename = 'comments';
```
Ensure "insert" policy exists for authenticated users.

### Problem: Frontend Gets 401/403 Errors
**Solution**: Verify environment variables
```bash
# Check if variables are loaded
console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)
```
Restart dev server after changing `.env.local`.

## 🎯 Success Criteria

Your integration is complete when:

- ✅ Users can vote and see immediate SOL transaction
- ✅ Vote reflects in database within 1 second
- ✅ All pages show updated data without manual refresh
- ✅ Chart displays historical voting trends
- ✅ Profile shows accurate user statistics
- ✅ Comments post and display correctly
- ✅ No console errors related to database queries

## 📊 Performance Checks

### Check Query Performance
```sql
-- Average query time for vote history
EXPLAIN ANALYZE 
SELECT * FROM vote_history 
WHERE market_id = 'your-market-id' 
ORDER BY snapshot_time DESC LIMIT 20;
```

Target: < 50ms

### Check Trigger Execution Time
```sql
SELECT * FROM pg_stat_user_functions 
WHERE funcname IN ('update_market_stats', 'create_vote_snapshot');
```

Target: < 100ms per execution

## 🔐 Security Verification

- [ ] RLS enabled on all tables
- [ ] Anon key used in frontend (not service role)
- [ ] Service role key never exposed to client
- [ ] All sensitive operations protected by RLS policies

## 🎉 Next Steps

Once integration is complete:
1. Remove any remaining mock/dummy data
2. Test with multiple users
3. Monitor Supabase Dashboard → Logs
4. Set up database backups
5. Consider adding real-time subscriptions for live updates
6. Optimize indexes based on query patterns

## 📞 Support Resources

- Supabase Docs: https://supabase.com/docs
- SQL Reference: https://www.postgresql.org/docs/
- Project README: `database/README.md`
