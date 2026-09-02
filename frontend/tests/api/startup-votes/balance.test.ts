import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { GET } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const fixtureUserId = crypto.randomUUID()
const fixtureStartupId = crypto.randomUUID()

const testUser = {
  id: fixtureUserId,
  privy_id: `test:automation-${fixtureUserId}`,
  email: 'automation-test@example.com',
  wallet_address: '0xAutomationTestWallet',
}

describe('GET /api/startup-votes/balance', () => {
  beforeAll(async () => {
    const { error: userError } = await supabaseAdmin.from('users').insert({
      id: fixtureUserId,
      privy_id: testUser.privy_id,
      email: testUser.email,
      wallet_address: testUser.wallet_address,
      username: `automation-${fixtureUserId.slice(0, 8)}`,
    } as any)

    if (userError) {
      throw new Error(`Failed to insert fixture user: ${userError.message}`)
    }

    const { error: startupError } = await supabaseAdmin.from('startup_startups').insert({
      id: fixtureStartupId,
      user_id: fixtureUserId,
      name: 'Automation Test Startup',
      slug: `automation-test-startup-${Date.now()}`,
      description: 'Fixture startup for automated tests.',
      logo_url: null,
      pitch: null,
      website: null,
      twitter: null,
      stage: 'Seed',
      phase: 1,
      vote_threshold: 10000,
      capital_target: 10000,
      total_yes_votes: 0,
      total_no_votes: 0,
    } as any)

    if (startupError) {
      throw new Error(`Failed to insert fixture startup: ${startupError.message}`)
    }
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(testUser as any)
  })

  afterAll(async () => {
    await supabaseAdmin.from('startup_vote_allocations').delete().eq('user_id', fixtureUserId)
    await supabaseAdmin.from('startup_vote_pool').delete().eq('user_id', fixtureUserId)
    await supabaseAdmin.from('startup_vote_grants').delete().eq('user_id', fixtureUserId)
    await supabaseAdmin.from('startup_startups').delete().eq('id', fixtureStartupId)
    await supabaseAdmin.from('users').delete().eq('id', fixtureUserId)
  })

  it('grants 100 votes on first call and returns idempotent values on the second call', async () => {
    const req = new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    })

    const res1 = await GET(req)
    expect(res1.status).toBe(200)
    const data1 = await res1.json()
    expect(data1.granted_today).toBe(100)
    expect(data1.remaining_today).toBe(100)
    expect(data1.newly_granted).toBe(true)
    expect(data1.total_spendable).toBe(100)
    expect(data1.pool_balance).toBe(0)

    const res2 = await GET(req)
    expect(res2.status).toBe(200)
    const data2 = await res2.json()
    expect(data2.granted_today).toBe(100)
    expect(data2.remaining_today).toBe(100)
    expect(data2.newly_granted).toBe(false)
    expect(data2.total_spendable).toBe(100)
    expect(data2.pool_balance).toBe(0)
  })
})
