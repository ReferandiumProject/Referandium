import { supabaseAdmin } from '../lib/supabaseServer'
import { retractPlatformFees } from './api/shared/cleanup'

async function getFixtureUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .or('email.ilike.%@example.com,wallet_address.like.0x%,custodial_wallet_address.like.0x%')

  if (error) {
    console.error('[teardown] failed to find fixture users:', error.message)
    throw error
  }

  return (data ?? []).map((u) => u.id)
}

export async function setup() {
  // no-op
}

export async function teardown() {
  const userIds = await getFixtureUserIds()
  if (userIds.length === 0) {
    console.log('[teardown] no fixture users to remove')
    return
  }

  console.log('[teardown] removing fixtures for user ids:', userIds.length)

  const { data: startups } = await supabaseAdmin
    .from('startup_startups')
    .select('id')
    .in('user_id', userIds)

  const startupIds = (startups ?? []).map((s) => s.id)

  try {
    await retractPlatformFees(startupIds, userIds, startupIds)
  } catch (err: any) {
    console.error('[teardown] retractPlatformFees failed:', err?.message ?? err)
  }

  const tablesByUser = [
    'startup_vote_allocations',
    'startup_vote_pool',
    'startup_vote_grants',
    'startup_transactions',
    'user_listing_credits',
    'listing_credit_events',
    'stripe_payments',
    'ledger_adjustments',
    'balances',
    'positions',
    'deposits',
  ]

  for (const table of tablesByUser) {
    const { error } = await supabaseAdmin.from(table).delete().in('user_id', userIds)
    if (error) {
      console.error(`[teardown] delete from ${table} failed:`, error.message)
    }
  }

  const { error: withdrawalsError } = await supabaseAdmin
    .from('withdrawals')
    .delete()
    .in('user_id', userIds)
  if (withdrawalsError) {
    console.error('[teardown] delete from withdrawals failed:', withdrawalsError.message)
  }

  if (startupIds.length > 0) {
    const startupTables = [
      'startup_vote_events',
      'startup_curve_trades',
      'startup_holdings',
      'startup_curves',
      'startup_markets',
    ]
    for (const table of startupTables) {
      const { error } = await supabaseAdmin.from(table).delete().in('startup_id', startupIds)
      if (error) console.error(`[teardown] delete from ${table} failed:`, error.message)
    }

    const { error: adminActionsError } = await supabaseAdmin
      .from('admin_actions')
      .delete()
      .in('target_id', startupIds)
    if (adminActionsError) console.error('[teardown] delete admin_actions target failed:', adminActionsError.message)

    const { error: startupsError } = await supabaseAdmin
      .from('startup_startups')
      .delete()
      .in('id', startupIds)
    if (startupsError) console.error('[teardown] delete startup_startups failed:', startupsError.message)
  }

  const { error: usersError } = await supabaseAdmin.from('users').delete().in('id', userIds)
  if (usersError) console.error('[teardown] delete users failed:', usersError.message)

  console.log('[teardown] fixture cleanup complete')
}
