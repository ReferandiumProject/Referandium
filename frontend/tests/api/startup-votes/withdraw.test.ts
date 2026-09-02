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

describe('POST /api/startup-votes/withdraw', () => {
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

    const castReq = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup.id, direction: 'yes', votes: 30 }),
    })
    const castRes = await castVote(castReq)
    expect(castRes.status).toBe(200)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [startup.id])
    await cleanupFixtures(founder.id, [])
  })

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

  it('returns withdrawn votes to the pool and reduces the deployed position', async () => {
    const balanceBefore = await currentBalance()
    const res = await withdraw(8)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.withdrawn).toBe(8)
    expect(body.still_deployed).toBe(22)
    expect(body.pool_available).toBe(balanceBefore.pool_balance + 8)
    expect(body.net_votes).toBe(22)
    expect(body.phase_closed).toBe(false)

    const { data: startupRow } = await supabaseAdmin
      .from('startup_startups')
      .select('total_yes_votes, total_no_votes')
      .eq('id', startup.id)
      .single()

    expect(startupRow!.total_yes_votes).toBe(22)
    expect(startupRow!.total_no_votes).toBe(0)

    const balanceAfter = await currentBalance()
    expect(balanceAfter.pool_balance).toBe(balanceBefore.pool_balance + 8)
    expect(balanceAfter.total_spendable).toBe(balanceBefore.total_spendable + 8)
  })

  it('rejects withdrawing more votes than are deployed with 400', async () => {
    const res = await withdraw(1000)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Not enough votes deployed/i)
  })

  it('closes the startup when withdrawing NO votes raises net over the threshold', async () => {
    // Seed a startup where YES is just under threshold but a NO position is keeping net below it.
    const crossFounder = await createFixtureUser()
    const crossUser = await createFixtureUser()
    const crossStartup = await createFixtureStartup(crossFounder.id, {
      vote_threshold: 10,
      total_yes_votes: 12,
      total_no_votes: 0,
    })

    try {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(crossUser as any)

      const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
        headers: { Authorization: 'Bearer mock-token' },
      }))
      const crossBalance = await balanceRes.json()
      expect(crossBalance.total_spendable).toBe(100)

      // deploy NO votes to match the seeded total_no_votes
      const castReq = new Request('http://localhost:3000/api/startup-votes/cast', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: crossStartup.id, direction: 'no', votes: 5 }),
      })
      const castRes = await castVote(castReq)
      expect(castRes.status).toBe(200)

      // withdrawing 3 NO votes raises net from 7 to 10, crossing the threshold
      const withdrawReq = new Request('http://localhost:3000/api/startup-votes/withdraw', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: crossStartup.id, votes: 3 }),
      })
      const res = await withdrawVote(withdrawReq)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.phase_closed).toBe(true)
      expect(body.withdrawn).toBe(3)

      const { data: startupRow, error } = await supabaseAdmin
        .from('startup_startups')
        .select('phase, phase1_closed_at')
        .eq('id', crossStartup.id)
        .single()

      expect(error).toBeNull()
      expect(startupRow!.phase).toBe(2)
      expect(startupRow!.phase1_closed_at).not.toBeNull()

      const { data: allocation } = await supabaseAdmin
        .from('startup_vote_allocations')
        .select('*')
        .eq('user_id', crossUser.id)
        .eq('startup_id', crossStartup.id)
        .single()

      // remaining deployed NO votes after the partial withdraw should be burned
      expect(allocation!.burned_at).not.toBeNull()

      // the withdrawn votes went to the pool; burned votes did not
      const finalBalance = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
        headers: { Authorization: 'Bearer mock-token' },
      })).then((r) => r.json())
      expect(finalBalance.pool_balance).toBe(3)
    } finally {
      await cleanupFixtures(crossUser.id, [crossStartup.id])
      await cleanupFixtures(crossFounder.id, [])
    }
  })
})

describe.sequential('POST /api/startup-votes/withdraw idempotency', () => {
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

    const castReq = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup.id, direction: 'yes', votes: 30 }),
    })
    const castRes = await castVote(castReq)
    expect(castRes.status).toBe(200)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [startup.id])
    await cleanupFixtures(founder.id, [])
  })

  async function withdrawWithKey(votes: number, key: string) {
    const req = new Request('http://localhost:3000/api/startup-votes/withdraw', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startup.id, votes, idempotency_key: key }),
    })
    return withdrawVote(req)
  }

  async function currentBalance() {
    const res = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    return res.json()
  }

  async function currentAllocation() {
    const { data, error } = await supabaseAdmin
      .from('startup_vote_allocations')
      .select('votes')
      .eq('user_id', user.id)
      .eq('startup_id', startup.id)
      .is('burned_at', null)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  it('replays a withdraw with the same idempotency key without double-crediting the pool', async () => {
    const key = '77777777-7777-7777-7777-777777777777'
    const firstRes = await withdrawWithKey(10, key)
    expect(firstRes.status).toBe(200)
    const first = await firstRes.json()
    expect(first.already_withdrawn).toBe(false)
    expect(first.withdrawn).toBe(10)

    const balanceBefore = await currentBalance()
    const allocationBefore = await currentAllocation()

    const secondRes = await withdrawWithKey(10, key)
    expect(secondRes.status).toBe(200)
    const second = await secondRes.json()
    expect(second.already_withdrawn).toBe(true)
    expect(second.withdrawn).toBe(first.withdrawn)
    expect(second.still_deployed).toBe(first.still_deployed)

    const balanceAfter = await currentBalance()
    const allocationAfter = await currentAllocation()

    expect(balanceAfter.pool_balance).toBe(balanceBefore.pool_balance)
    expect(balanceAfter.total_spendable).toBe(balanceBefore.total_spendable)
    expect(allocationAfter.votes).toBe(allocationBefore.votes)
  })

  it('returns 409 when the same idempotency key is used for a different amount', async () => {
    const key = '88888888-8888-8888-8888-888888888888'
    const firstRes = await withdrawWithKey(5, key)
    expect(firstRes.status).toBe(200)

    const secondRes = await withdrawWithKey(6, key)
    expect(secondRes.status).toBe(409)
  })
})
