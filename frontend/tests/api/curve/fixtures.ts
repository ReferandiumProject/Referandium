import { supabaseAdmin } from '@/lib/supabaseServer'

export interface CurveFixtureUser {
  id: string
  privy_id: string
  email: string
  wallet_address: string
}

export interface CurveFixtureStartup {
  id: string
  userId: string
  slug: string
  capitalTarget: number
  voteThreshold: number
}

function makeSuffix() {
  return crypto.randomUUID().slice(0, 8)
}

export async function createCurveFixtureUser(balanceUsdc = 0): Promise<CurveFixtureUser> {
  const suffix = makeSuffix()
  const id = crypto.randomUUID()
  const user: CurveFixtureUser = {
    id,
    privy_id: `did:privy:curve-fixture-${suffix}`,
    email: `curve-fixture-${suffix}@example.com`,
    wallet_address: `0xCurveFixture${suffix}`,
  }

  const { error: userError } = await supabaseAdmin.from('users').insert({
    id: user.id,
    privy_id: user.privy_id,
    email: user.email,
    wallet_address: user.wallet_address,
    username: `curve-fixture-${suffix}`,
  } as any)
  if (userError) throw new Error(`Failed to insert curve fixture user: ${userError.message}`)

  const { error: balanceError } = await supabaseAdmin.from('balances').insert({
    user_id: user.id,
    available_usdc: balanceUsdc,
    locked_usdc: 0,
  } as any)
  if (balanceError) throw new Error(`Failed to insert curve fixture balance: ${balanceError.message}`)

  return user
}

export async function createCurveAdminUser(): Promise<CurveFixtureUser> {
  const suffix = makeSuffix()
  const adminEmail = (process.env.ADMIN_EMAILS ?? 'admin@example.com').split(',')[0].trim()
  const id = crypto.randomUUID()
  const user: CurveFixtureUser = {
    id,
    privy_id: `did:privy:curve-admin-${suffix}`,
    email: adminEmail,
    wallet_address: `0xCurveAdmin${suffix}`,
  }

  const { error } = await supabaseAdmin.from('users').insert({
    id: user.id,
    privy_id: user.privy_id,
    email: user.email,
    wallet_address: user.wallet_address,
    username: `curve-admin-${suffix}`,
  } as any)
  if (error) throw new Error(`Failed to insert curve admin fixture user: ${error.message}`)

  return user
}

export async function createCurveFixtureStartup(
  userId: string,
  overrides: { capitalTarget?: number; voteThreshold?: number } = {}
): Promise<CurveFixtureStartup> {
  const suffix = makeSuffix()
  const id = crypto.randomUUID()
  const capitalTarget = overrides.capitalTarget ?? 100
  const voteThreshold = overrides.voteThreshold ?? 10

  const startup: CurveFixtureStartup = {
    id,
    userId,
    slug: `curve-fixture-startup-${suffix}`,
    capitalTarget,
    voteThreshold,
  }

  const { error } = await supabaseAdmin.from('startup_startups').insert({
    id: startup.id,
    user_id: userId,
    name: `Curve Fixture Startup ${suffix}`,
    slug: startup.slug,
    description: 'Curve fixture startup for automated tests.',
    logo_url: null,
    pitch: null,
    website: null,
    twitter: null,
    stage: 'Seed',
    phase: 1,
    vote_threshold: voteThreshold,
    capital_target: capitalTarget,
    total_yes_votes: 0,
    total_no_votes: 0,
  } as any)
  if (error) throw new Error(`Failed to insert curve fixture startup: ${error.message}`)

  return startup
}

export async function crossToPhase2(
  startup: CurveFixtureStartup,
  voterId: string
): Promise<{ startup: CurveFixtureStartup; castResult: any }> {
  const grant = await supabaseAdmin.rpc('claim_daily_grant', { p_user_id: voterId })
  if (grant.error) throw new Error(`Failed to claim daily grant: ${grant.error.message}`)

  const cast = await supabaseAdmin.rpc('cast_vote', {
    p_user_id: voterId,
    p_startup_id: startup.id,
    p_direction: 'yes',
    p_votes: startup.voteThreshold,
  })
  if (cast.error) throw new Error(`Failed to cast crossing votes: ${cast.error.message}`)

  return { startup, castResult: cast.data![0] }
}

export async function cleanupCurveFixtures(
  userIds: string[],
  startupIds: string[]
): Promise<void> {
  if (startupIds.length === 0 && userIds.length === 0) return

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
    await supabaseAdmin.from('balances').delete().in('user_id', userIds)
    await supabaseAdmin.from('users').delete().in('id', userIds)
  }

  if (startupIds.length > 0) {
    await supabaseAdmin.from('startup_startups').delete().in('id', startupIds)
  }
}
