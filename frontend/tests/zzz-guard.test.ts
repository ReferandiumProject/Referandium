import { describe, it, expect } from 'vitest'
import { supabaseAdmin } from '@/lib/supabaseServer'

async function getFixtureUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .or('email.ilike.%@example.com,wallet_address.like.0x%,custodial_wallet_address.like.0x%')

  if (error) throw error
  return (data ?? []).map((u) => u.id)
}

describe('fixture leakage guard', () => {
  it('no fixture users or their rows remain', async () => {
    const userIds = await getFixtureUserIds()
    expect(userIds, `fixture users remain: ${JSON.stringify(userIds)}`).toHaveLength(0)

    if (userIds.length > 0) {
      const checks = [
        { table: 'balances', column: 'user_id' },
        { table: 'ledger_adjustments', column: 'user_id' },
        { table: 'withdrawals', column: 'user_id' },
        { table: 'stripe_payments', column: 'user_id' },
        { table: 'listing_credit_events', column: 'user_id' },
        { table: 'deposits', column: 'user_id' },
        { table: 'startup_startups', column: 'user_id' },
      ]

      for (const { table, column } of checks) {
        const { count, error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .in(column, userIds)

        if (error) throw error
        expect(count, `${table} has fixture rows`).toBe(0)
      }
    }
  })
})
