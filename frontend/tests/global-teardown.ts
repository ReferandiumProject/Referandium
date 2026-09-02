import fs from 'fs'
import os from 'os'
import path from 'path'
import { supabaseAdmin } from '../lib/supabaseServer'
import { retractPlatformFees } from './api/shared/cleanup'

const PLATFORM_USER_ID = process.env.PLATFORM_SYSTEM_USER_ID!
export const SNAPSHOT_PATH = path.join(os.tmpdir(), 'referandium-test-snapshot.json')
export const BALANCE_SNAPSHOT_PATH = SNAPSHOT_PATH

async function getFixtureUserIds(): Promise<string[]> {
  // Transient fixtures must set a 'test:' privy_id. The email fallback is a
  // safety net for tests that have not been migrated to the deliberate marker.
  // 'permanent:' is a hard stop; see the guard in teardown().
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .or('privy_id.ilike.test:%,email.ilike.%@example.com')

  if (error) {
    console.error('[teardown] failed to find fixture users:', error.message)
    throw error
  }

  return (data ?? []).map((u) => u.id)
}

export async function setup() {
  const { data: balance, error: balanceError } = await supabaseAdmin
    .from('balances')
    .select('available_usdc')
    .eq('user_id', PLATFORM_USER_ID)
    .single()

  if (balanceError) {
    throw new Error(`[setup] could not read platform balance: ${balanceError.message}`)
  }

  const [startups, graduations, systemErrors] = await Promise.all([
    supabaseAdmin.from('startup_startups').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabaseAdmin.from('graduations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('system_errors').select('*', { count: 'exact', head: true }).is('resolved_at', null),
  ])

  await fs.promises.writeFile(
    SNAPSHOT_PATH,
    JSON.stringify({
      available_usdc: String(balance!.available_usdc ?? '0'),
      startup_startups: startups.count ?? 0,
      graduations: graduations.count ?? 0,
      system_errors: systemErrors.count ?? 0,
    })
  )
}

export async function teardown() {
  const userIds = await getFixtureUserIds()
  if (userIds.length === 0) {
    console.log('[teardown] no fixture users to remove')
    return
  }

  // Hard guard: if any user in the delete list is a permanent fixture, stop.
  const { data: permanentMatches, error: permanentError } = await supabaseAdmin
    .from('users')
    .select('id,privy_id')
    .in('id', userIds)
    .ilike('privy_id', 'permanent:%')

  if (permanentError) throw permanentError

  if ((permanentMatches ?? []).length > 0) {
    const permanentIds = (permanentMatches ?? []).map((u) => u.id).join(', ')
    throw new Error(
      `[teardown] aborting: permanent fixture(s) selected for deletion: ${permanentIds}`
    )
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
  ]

  for (const table of tablesByUser) {
    const { error } = await supabaseAdmin.from(table).delete().in('user_id', userIds)
    if (error) {
      console.error(`[teardown] delete from ${table} failed:`, error.message)
    }
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

  const { error: adminUserActionsError } = await supabaseAdmin
    .from('admin_actions')
    .delete()
    .in('admin_user_id', userIds)
  if (adminUserActionsError) console.error('[teardown] delete admin_actions admin_user failed:', adminUserActionsError.message)

  const { error: usersError } = await supabaseAdmin.from('users').delete().in('id', userIds)
  if (usersError) console.error('[teardown] delete users failed:', usersError.message)

  // Verify operational table counts match the pre-run snapshot.
  const snapshot = JSON.parse(await fs.promises.readFile(SNAPSHOT_PATH, 'utf8'))
  const [afterStartups, afterGraduations, afterSystemErrors] = await Promise.all([
    supabaseAdmin.from('startup_startups').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabaseAdmin.from('graduations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('system_errors').select('*', { count: 'exact', head: true }).is('resolved_at', null),
  ])

  if ((afterStartups.count ?? 0) !== snapshot.startup_startups) {
    throw new Error(
      `[teardown] startup_startups count changed: before=${snapshot.startup_startups} after=${afterStartups.count ?? 0}`
    )
  }
  if ((afterGraduations.count ?? 0) !== snapshot.graduations) {
    throw new Error(
      `[teardown] graduations count changed: before=${snapshot.graduations} after=${afterGraduations.count ?? 0}`
    )
  }
  if ((afterSystemErrors.count ?? 0) !== snapshot.system_errors) {
    throw new Error(
      `[teardown] system_errors count changed: before=${snapshot.system_errors} after=${afterSystemErrors.count ?? 0}`
    )
  }

  console.log('[teardown] fixture cleanup complete')
}
