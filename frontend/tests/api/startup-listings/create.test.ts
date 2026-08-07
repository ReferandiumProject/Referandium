import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { POST as createListing } from '@/app/api/startup-listings/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('POST /api/startup-listings', () => {
  let fundedUser: Awaited<ReturnType<typeof createFixtureUser>>
  const createdStartupIds: string[] = []

  async function fundUser(userId: string, amount: number) {
    const { error } = await supabaseAdmin.from('balances').insert({
      user_id: userId,
      available_usdc: amount,
      locked_usdc: 0,
    } as any)
    if (error) throw new Error(`Failed to fund user: ${error.message}`)
  }

  async function currentBalance(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', userId)
      .single()
    if (error) throw new Error(`Balance query failed: ${error.message}`)
    return Number(data!.available_usdc ?? 0)
  }

  async function post(body: Record<string, unknown>) {
    const req = new Request('http://localhost:3000/api/startup-listings', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return createListing(req)
  }

  beforeAll(async () => {
    fundedUser = await createFixtureUser()
    await fundUser(fundedUser.id, 100)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(fundedUser as any)
  })

  afterAll(async () => {
    await supabaseAdmin.from('startup_transactions').delete().eq('user_id', fundedUser.id)
    if (createdStartupIds.length > 0) {
      await supabaseAdmin.from('startup_markets').delete().in('startup_id', createdStartupIds)
      await supabaseAdmin.from('startup_startups').delete().in('id', createdStartupIds)
    }
    await supabaseAdmin.from('balances').delete().eq('user_id', fundedUser.id)
    await cleanupFixtures(fundedUser.id, [])
  })

  it('creates a listing and deducts the 8 USDC fee', async () => {
    const res = await post({
      name: 'Acme Launchpad',
      description: 'A thing that does stuff',
      vote_threshold: 5000,
      capital_target: 25000,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.slug).toBeDefined()
    expect(body.fee).toBe(8)
    expect(body.available_after).toBe(92)

    createdStartupIds.push(body.id)

    const balance = await currentBalance(fundedUser.id)
    expect(balance).toBe(92)
  })

  it('rejects a vote_threshold below 1,000 with 400', async () => {
    const res = await post({
      name: 'Low Threshold',
      description: 'Too easy',
      vote_threshold: 999,
      capital_target: 1000,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/vote threshold/i)
    expect(body.error).toMatch(/between/i)

    const balance = await currentBalance(fundedUser.id)
    expect(balance).toBe(92)
  })

  it('rejects a capital_target below 100 with 400', async () => {
    const res = await post({
      name: 'Low Capital',
      description: 'Too small',
      vote_threshold: 10000,
      capital_target: 99,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/capital target/i)
    expect(body.error).toMatch(/between/i)

    const balance = await currentBalance(fundedUser.id)
    expect(balance).toBe(92)
  })

  it('rejects a user with insufficient balance with 402 and leaves balance unchanged', async () => {
    const poorUser = await createFixtureUser()
    await fundUser(poorUser.id, 5)

    try {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(poorUser as any)
      const res = await post({
        name: 'Broke Startup',
        description: 'No money',
        vote_threshold: 10000,
        capital_target: 100000,
      })
      expect(res.status).toBe(402)
      const body = await res.json()
      expect(body.error).toMatch(/insufficient balance|no balance/i)

      const balance = await currentBalance(poorUser.id)
      expect(balance).toBe(5)
    } finally {
      await supabaseAdmin.from('startup_transactions').delete().eq('user_id', poorUser.id)
      await supabaseAdmin.from('balances').delete().eq('user_id', poorUser.id)
      await cleanupFixtures(poorUser.id, [])
    }
  })

  it('generates distinct slugs for listings with the same name', async () => {
    const baseName = 'Repeated Name'

    const first = await post({
      name: baseName,
      description: 'First one',
      vote_threshold: 5000,
      capital_target: 50000,
    })
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    createdStartupIds.push(firstBody.id)

    const second = await post({
      name: baseName,
      description: 'Second one',
      vote_threshold: 5000,
      capital_target: 50000,
    })
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    createdStartupIds.push(secondBody.id)

    expect(secondBody.slug).not.toBe(firstBody.slug)
    expect(secondBody.available_after).toBe(firstBody.available_after - 8)
  })
})
