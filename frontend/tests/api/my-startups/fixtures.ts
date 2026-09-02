import { supabaseAdmin } from '@/lib/supabaseServer'
import { retractPlatformFees } from '@/tests/api/shared/cleanup'

export interface MyStartupsFixtureUser {
  id: string
  privy_id: string
  email: string
  wallet_address: string
}

export interface MyStartupsFixtureStartup {
  id: string
  userId: string
  slug: string
}

function makeSuffix() {
  return crypto.randomUUID().slice(0, 8)
}

export async function createMyStartupsFixtureUser(): Promise<MyStartupsFixtureUser> {
  const suffix = makeSuffix()
  const id = crypto.randomUUID()
  const user: MyStartupsFixtureUser = {
    id,
    privy_id: `test:my-startups-fixture-${suffix}`,
    email: `my-startups-fixture-${suffix}@example.com`,
    wallet_address: `0xMyStartupsFixture${suffix}`,
  }

  const { error } = await supabaseAdmin.from('users').insert({
    id: user.id,
    privy_id: user.privy_id,
    email: user.email,
    wallet_address: user.wallet_address,
    username: `my-startups-fixture-${suffix}`,
  } as any)
  if (error) throw new Error(`Failed to insert my-startups fixture user: ${error.message}`)

  return user
}

export async function createMyStartupsFixtureStartup(
  userId: string,
  overrides: Partial<{
    name: string
    description: string
    pitch: string | null
    website: string | null
    twitter: string | null
    logo_url: string | null
    stage: string | null
    phase: number
    voteThreshold: number
    capitalTarget: number
    deletedAt: string | null
  }> = {}
): Promise<MyStartupsFixtureStartup> {
  const suffix = makeSuffix()
  const id = crypto.randomUUID()
  const slug = `my-startups-fixture-${suffix}`

  const { error } = await supabaseAdmin.from('startup_startups').insert({
    id,
    user_id: userId,
    name: overrides.name ?? `My Startups Fixture ${suffix}`,
    slug,
    description: overrides.description ?? 'My-startups fixture startup for automated tests.',
    pitch: overrides.pitch ?? null,
    website: overrides.website ?? null,
    twitter: overrides.twitter ?? null,
    logo_url: overrides.logo_url ?? null,
    stage: overrides.stage ?? 'Seed',
    phase: overrides.phase ?? 1,
    vote_threshold: overrides.voteThreshold ?? 10,
    capital_target: overrides.capitalTarget ?? 100,
    total_yes_votes: 0,
    total_no_votes: 0,
    deleted_at: overrides.deletedAt ?? null,
  } as any)
  if (error) throw new Error(`Failed to insert my-startups fixture startup: ${error.message}`)

  return { id, userId, slug }
}

export async function cleanupMyStartupsFixtures(
  userIds: string[],
  startupIds: string[]
): Promise<void> {
  if (startupIds.length === 0 && userIds.length === 0) return

  await retractPlatformFees(startupIds, userIds)

  for (const startupId of startupIds) {
    await supabaseAdmin.from('startup_curve_trades').delete().eq('startup_id', startupId)
    await supabaseAdmin.from('startup_holdings').delete().eq('startup_id', startupId)
    await supabaseAdmin.from('startup_curves').delete().eq('startup_id', startupId)
    await supabaseAdmin.from('startup_vote_allocations').delete().eq('startup_id', startupId)
    await supabaseAdmin.from('startup_vote_events').delete().eq('startup_id', startupId)
  }

  if (userIds.length > 0) {
    await supabaseAdmin.from('startup_vote_pool').delete().in('user_id', userIds)
    await supabaseAdmin.from('startup_vote_grants').delete().in('user_id', userIds)
    await supabaseAdmin.from('admin_actions').delete().in('admin_user_id', userIds)
    await supabaseAdmin.from('admin_actions').delete().in('target_id', userIds)
    await supabaseAdmin.from('user_listing_credits').delete().in('user_id', userIds)
    await supabaseAdmin.from('listing_credit_events').delete().in('user_id', userIds)
    await supabaseAdmin.from('stripe_payments').delete().in('user_id', userIds)
    await supabaseAdmin.from('balances').delete().in('user_id', userIds)
    await supabaseAdmin.from('users').delete().in('id', userIds)
  }

  if (startupIds.length > 0) {
    await supabaseAdmin.from('startup_startups').delete().in('id', startupIds)
  }
}
