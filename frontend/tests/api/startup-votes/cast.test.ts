import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { POST as withdrawVote } from '@/app/api/startup-votes/withdraw/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('POST /api/startup-votes/cast', () => {
  let founder: Awaited<ReturnType<typeof createFixtureUser>>
  let user: Awaited<ReturnType<typeof createFixtureUser>>
  let startup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    founder = await createFixtureUser()
    user = await createFixtureUser()
    startup = await createFixtureStartup(founder.id)

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const balance = await balanceRes.json()
    expect(balance.total_spendable).toBe(100)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [startup.id])
    await supabaseAdmin.from('users').delete().eq('id', founder.id)
  })

  async function cast(direction: 'yes' | 'no', votes: number) {
    const req = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup.id, direction, votes }),
    })
    return castVote(req)
  }

  async function withdraw(votes: number) {
    const req = new Request('http://localhost:3000/api/startup-votes/withdraw', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup.id, votes }),
    })
    return withdrawVote(req)
  }

  async function currentBalance() {
    const res = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    return res.json()
  }

  async function currentStartup() {
    const { data, error } = await supabaseAdmin
      .from('startup_startups')
      .select('total_yes_votes, total_no_votes')
      .eq('id', startup.id)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  it('deploys YES votes, decrements the grant, and increases the startup YES total', async () => {
    const res = await cast('yes', 20)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deployed).toBe(20)
    expect(body.from_grant).toBe(20)
    expect(body.from_pool).toBe(0)
    expect(body.net_votes).toBe(20)
    expect(body.phase_closed).toBe(false)

    const startupRow = await currentStartup()
    expect(startupRow.total_yes_votes).toBe(20)
    expect(startupRow.total_no_votes).toBe(0)

    const balance = await currentBalance()
    expect(balance.remaining_today).toBe(80)
    expect(balance.total_spendable).toBe(80)
    expect(balance.pool_balance).toBe(0)
  })

  it('casting again in the same direction adds to the existing position', async () => {
    const res = await cast('yes', 10)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deployed).toBe(10)
    expect(body.from_grant).toBe(10)
    expect(body.from_pool).toBe(0)
    expect(body.net_votes).toBe(30)

    const startupRow = await currentStartup()
    expect(startupRow.total_yes_votes).toBe(30)

    const balance = await currentBalance()
    expect(balance.remaining_today).toBe(70)
    expect(balance.total_spendable).toBe(70)
  })

  it('rejects casting the opposite direction with 409', async () => {
    const res = await cast('no', 5)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already hold/i)
  })

  it('rejects casting more votes than available with 400', async () => {
    const res = await cast('yes', 1000)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Not enough votes/i)
  })

  it('drains the grant first and draws the shortfall from the pool', async () => {
    // create a pool balance by withdrawing some of the deployed YES votes
    const withdrawRes = await withdraw(10)
    expect(withdrawRes.status).toBe(200)

    const balanceAfterWithdraw = await currentBalance()
    expect(balanceAfterWithdraw.remaining_today).toBe(70)
    expect(balanceAfterWithdraw.pool_balance).toBe(10)
    expect(balanceAfterWithdraw.total_spendable).toBe(80)

    // cast 75: 70 from the remaining grant, then 5 from the pool
    const res = await cast('yes', 75)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.from_grant).toBe(70)
    expect(body.from_pool).toBe(5)
    expect(body.deployed).toBe(75)
    expect(body.net_votes).toBe(95)

    const startupRow = await currentStartup()
    expect(startupRow.total_yes_votes).toBe(95)

    const balance = await currentBalance()
    expect(balance.remaining_today).toBe(0)
    expect(balance.pool_balance).toBe(5)
    expect(balance.total_spendable).toBe(5)
  })

  it('rejects a founder voting on their own startup with 403, leaving totals and balance unchanged', async () => {
    const beforeStartup = await currentStartup()

    vi.mocked(getAuthenticatedUser).mockResolvedValue(founder as any)
    const beforeBalanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const beforeBalance = await beforeBalanceRes.json()

    const res = await cast('yes', 25)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/cannot vote on your own startup/i)

    const afterStartup = await currentStartup()
    expect(afterStartup.total_yes_votes).toBe(beforeStartup.total_yes_votes)
    expect(afterStartup.total_no_votes).toBe(beforeStartup.total_no_votes)

    const afterBalanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const afterBalance = await afterBalanceRes.json()
    expect(afterBalance.total_spendable).toBe(beforeBalance.total_spendable)
    expect(afterBalance.remaining_today).toBe(beforeBalance.remaining_today)
    expect(afterBalance.pool_balance).toBe(beforeBalance.pool_balance)
  })

  it('allows a different user to vote on a startup after the founder is blocked', async () => {
    const beforeStartup = await currentStartup()

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const res = await cast('yes', 5)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deployed).toBe(5)

    const afterStartup = await currentStartup()
    expect(afterStartup.total_yes_votes).toBe(beforeStartup.total_yes_votes + 5)
  })
})

describe.sequential('POST /api/startup-votes/cast idempotency', () => {
  let founder: Awaited<ReturnType<typeof createFixtureUser>>
  let user: Awaited<ReturnType<typeof createFixtureUser>>
  let startup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    founder = await createFixtureUser()
    user = await createFixtureUser()
    startup = await createFixtureStartup(founder.id)

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const balance = await balanceRes.json()
    expect(balance.total_spendable).toBe(100)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [startup.id])
    await cleanupFixtures(founder.id, [])
  })

  async function castWithKey(direction: 'yes' | 'no', votes: number, key: string) {
    const req = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup.id, direction, votes, idempotency_key: key }),
    })
    return castVote(req)
  }

  async function currentAllocation() {
    const { data, error } = await supabaseAdmin
      .from('startup_vote_allocations')
      .select('direction, votes')
      .eq('user_id', user.id)
      .eq('startup_id', startup.id)
      .is('burned_at', null)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  async function currentStartup() {
    const { data, error } = await supabaseAdmin
      .from('startup_startups')
      .select('total_yes_votes, total_no_votes')
      .eq('id', startup.id)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  async function currentBalance() {
    const res = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    return res.json()
  }

  it('replays a cast with the same idempotency key without double-debiting or changing tallies', async () => {
    const key = '55555555-5555-5555-5555-555555555555'
    const firstRes = await castWithKey('yes', 40, key)
    expect(firstRes.status).toBe(200)
    const first = await firstRes.json()
    expect(first.already_cast).toBe(false)
    expect(first.deployed).toBe(40)

    const balanceBefore = await currentBalance()
    const startupBefore = await currentStartup()
    const allocationBefore = await currentAllocation()

    const secondRes = await castWithKey('yes', 40, key)
    expect(secondRes.status).toBe(200)
    const second = await secondRes.json()
    expect(second.already_cast).toBe(true)
    expect(second.deployed).toBe(first.deployed)
    expect(second.from_grant).toBe(first.from_grant)
    expect(second.from_pool).toBe(first.from_pool)

    const balanceAfter = await currentBalance()
    const startupAfter = await currentStartup()
    const allocationAfter = await currentAllocation()

    expect(balanceAfter.remaining_today).toBe(balanceBefore.remaining_today)
    expect(balanceAfter.total_spendable).toBe(balanceBefore.total_spendable)
    expect(balanceAfter.pool_balance).toBe(balanceBefore.pool_balance)
    expect(startupAfter.total_yes_votes).toBe(startupBefore.total_yes_votes)
    expect(startupAfter.total_no_votes).toBe(startupBefore.total_no_votes)
    expect(allocationAfter.votes).toBe(allocationBefore.votes)
    expect(allocationAfter.direction).toBe(allocationBefore.direction)
  })

  it('returns 409 when the same idempotency key is used for different parameters', async () => {
    const key = '66666666-6666-6666-6666-666666666666'
    const firstRes = await castWithKey('yes', 10, key)
    expect(firstRes.status).toBe(200)

    const secondRes = await castWithKey('no', 10, key)
    expect(secondRes.status).toBe(409)
  })
})
