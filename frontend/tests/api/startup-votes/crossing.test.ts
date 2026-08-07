import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('threshold crossing and burn', () => {
  let user: Awaited<ReturnType<typeof createFixtureUser>>
  let closingStartup: Awaited<ReturnType<typeof createFixtureStartup>>
  let otherStartup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    user = await createFixtureUser()
    closingStartup = await createFixtureStartup(user.id, { vote_threshold: 10 })
    otherStartup = await createFixtureStartup(user.id, { vote_threshold: 10 })

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    // Claim the daily grant first so the user has votes to spend.
    const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const balance = await balanceRes.json()
    expect(balance.total_spendable).toBe(100)

    // Seed a small allocation on the other startup so we can verify it stays untouched.
    const otherReq = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: otherStartup.id, direction: 'yes', votes: 3 }),
    })
    const otherRes = await castVote(otherReq)
    expect(otherRes.status).toBe(200)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [closingStartup.id, otherStartup.id])
  })

  async function cast(direction: 'yes' | 'no', votes: number, startupId: string) {
    const req = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startupId, direction, votes }),
    })
    return castVote(req)
  }

  async function currentBalance() {
    const res = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    return res.json()
  }

  it('closes the startup, marks allocations burned, and leaves the pool untouched', async () => {
    const balanceBefore = await currentBalance()

    const res = await cast('yes', 10, closingStartup.id)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.phase_closed).toBe(true)
    expect(body.net_votes).toBe(10)

    const { data: startupRow } = await supabaseAdmin
      .from('startup_startups')
      .select('phase, phase1_closed_at, total_yes_votes, total_no_votes')
      .eq('id', closingStartup.id)
      .single()

    expect(startupRow!.phase).toBe(2)
    expect(startupRow!.phase1_closed_at).not.toBeNull()
    expect(startupRow!.total_yes_votes).toBe(10)
    expect(startupRow!.total_no_votes).toBe(0)

    const { data: closingAlloc } = await supabaseAdmin
      .from('startup_vote_allocations')
      .select('*')
      .eq('user_id', user.id)
      .eq('startup_id', closingStartup.id)
      .single()

    expect(closingAlloc!.burned_at).not.toBeNull()

    const balanceAfter = await currentBalance()
    expect(balanceAfter.pool_balance).toBe(balanceBefore.pool_balance)
  })

  it('rejects any later vote on the closed startup', async () => {
    const res = await cast('yes', 1, closingStartup.id)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/Voting is closed/i)
  })

  it('does not burn allocations on a different startup', async () => {
    const { data: otherAlloc } = await supabaseAdmin
      .from('startup_vote_allocations')
      .select('*')
      .eq('user_id', user.id)
      .eq('startup_id', otherStartup.id)
      .single()

    expect(otherAlloc!.burned_at).toBeNull()

    const { data: otherRow } = await supabaseAdmin
      .from('startup_startups')
      .select('phase')
      .eq('id', otherStartup.id)
      .single()

    expect(otherRow!.phase).toBe(1)
  })
})
