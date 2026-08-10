import { supabaseAdmin } from '@/lib/supabaseServer'
import { retractPlatformFees } from '@/tests/api/shared/cleanup'

export interface FixtureUser {
  id: string
  privy_id: string
  email: string
  wallet_address: string | null
}

export interface FixtureStartup {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  total_yes_votes: number
  total_no_votes: number
  vote_threshold: number
  capital_target: number | null
  phase: number
}

export async function createFixtureUser(email?: string): Promise<FixtureUser> {
  const id = crypto.randomUUID()
  const suffix = id.slice(0, 8)
  const user: FixtureUser = {
    id,
    privy_id: `did:privy:fixture-admin-${suffix}`,
    email: email ?? `fixture-admin-${suffix}@example.com`,
    wallet_address: `0xFixtureAdmin${suffix}`,
  }

  const { error } = await supabaseAdmin.from('users').insert({
    id: user.id,
    privy_id: user.privy_id,
    email: user.email,
    wallet_address: user.wallet_address,
    username: `fixture-admin-${suffix}`,
  } as any)

  if (error) {
    throw new Error(`Failed to insert fixture user: ${error.message}`)
  }

  return user
}

export async function createFixtureStartup(
  userId: string,
  overrides: Partial<FixtureStartup> = {}
): Promise<FixtureStartup> {
  const id = crypto.randomUUID()
  const suffix = id.slice(0, 8)

  const startup: FixtureStartup = {
    id,
    name: `Admin Fixture Startup ${suffix}`,
    slug: `admin-fixture-startup-${suffix}`,
    description: 'Fixture startup for admin tests.',
    logo_url: null,
    total_yes_votes: 0,
    total_no_votes: 0,
    vote_threshold: 100,
    capital_target: 1000,
    phase: 1,
    ...overrides,
  }

  const { error } = await supabaseAdmin.from('startup_startups').insert({
    id: startup.id,
    user_id: userId,
    name: startup.name,
    slug: startup.slug,
    description: startup.description,
    logo_url: startup.logo_url,
    pitch: null,
    website: null,
    twitter: null,
    stage: 'Seed',
    phase: startup.phase,
    vote_threshold: startup.vote_threshold,
    capital_target: startup.capital_target,
    total_yes_votes: startup.total_yes_votes,
    total_no_votes: startup.total_no_votes,
  } as any)

  if (error) {
    throw new Error(`Failed to insert fixture startup: ${error.message}`)
  }

  return startup
}

export async function cleanupAdminFixtures(
  userIds: string[],
  startupIds: string[]
): Promise<void> {
  await retractPlatformFees(startupIds, userIds)

  try {
    if (startupIds.length > 0) {
      await supabaseAdmin.from('startup_vote_events').delete().in('startup_id', startupIds)
    }
  } catch {
    // best-effort
  }

  if (userIds.length > 0) {
    await supabaseAdmin.from('startup_vote_allocations').delete().in('user_id', userIds)
    await supabaseAdmin.from('startup_vote_pool').delete().in('user_id', userIds)
    await supabaseAdmin.from('startup_vote_grants').delete().in('user_id', userIds)
    await supabaseAdmin.from('startup_transactions').delete().in('user_id', userIds)
    await supabaseAdmin.from('balances').delete().in('user_id', userIds)
    await supabaseAdmin.from('positions').delete().in('user_id', userIds)
  }

  if (startupIds.length > 0) {
    try {
      await supabaseAdmin.from('admin_actions').delete().in('target_id', startupIds)
    } catch {
      // table/column may not exist
    }
    await supabaseAdmin.from('startup_startups').delete().in('id', startupIds)
  }

  if (userIds.length > 0) {
    try {
      await supabaseAdmin.from('admin_actions').delete().in('admin_user_id', userIds)
    } catch {
      // table/column may not exist
    }
    await supabaseAdmin.from('users').delete().in('id', userIds)
  }
}
