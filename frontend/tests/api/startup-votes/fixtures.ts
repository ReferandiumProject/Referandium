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

export async function createFixtureUser(): Promise<FixtureUser> {
  const id = crypto.randomUUID()
  const suffix = id.slice(0, 8)
  const user: FixtureUser = {
    id,
    privy_id: `did:privy:fixture-${suffix}`,
    email: `fixture-${suffix}@example.com`,
    wallet_address: `0xFixture${suffix}`,
  }

  const { error } = await supabaseAdmin.from('users').insert({
    id: user.id,
    privy_id: user.privy_id,
    email: user.email,
    wallet_address: user.wallet_address,
    username: `fixture-${suffix}`,
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
    name: `Fixture Startup ${suffix}`,
    slug: `fixture-startup-${suffix}`,
    description: 'Fixture startup for automated tests.',
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

export async function cleanupFixtures(
  userId: string,
  startupIds: string[],
  listingStartupIds: string[] = []
): Promise<void> {
  await retractPlatformFees(startupIds, [userId], listingStartupIds)

  try {
    if (startupIds.length > 0) {
      await supabaseAdmin
        .from('startup_vote_events')
        .delete()
        .in('startup_id', startupIds)
    }
  } catch {
    // table or column may not exist; fixture cleanup is best-effort here
  }

  try {
    if (startupIds.length > 0) {
      await supabaseAdmin.from('startup_curve_trades').delete().in('startup_id', startupIds)
      await supabaseAdmin.from('startup_holdings').delete().in('startup_id', startupIds)
      await supabaseAdmin.from('startup_curves').delete().in('startup_id', startupIds)
    }
  } catch {
    // a startup that never crossed into phase 2 has no curve rows; best-effort cleanup
  }

  await supabaseAdmin
    .from('startup_vote_allocations')
    .delete()
    .eq('user_id', userId)

  await supabaseAdmin.from('startup_vote_pool').delete().eq('user_id', userId)
  await supabaseAdmin.from('startup_vote_grants').delete().eq('user_id', userId)
  await supabaseAdmin.from('startup_transactions').delete().eq('user_id', userId)

  if (startupIds.length > 0) {
    await supabaseAdmin.from('startup_markets').delete().in('startup_id', startupIds)
    await supabaseAdmin.from('startup_startups').delete().in('id', startupIds)
  }
  await supabaseAdmin.from('users').delete().eq('id', userId)
}
