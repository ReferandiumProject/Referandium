import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { GET as listStartups } from '@/app/api/startup-votes/list/route'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('GET /api/startup-votes/list', () => {
  let founder: Awaited<ReturnType<typeof createFixtureUser>>
  let user: Awaited<ReturnType<typeof createFixtureUser>>
  let activeStartup: Awaited<ReturnType<typeof createFixtureStartup>>
  let closedStartup: Awaited<ReturnType<typeof createFixtureStartup>>
  let negativeStartup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    founder = await createFixtureUser()
    user = await createFixtureUser()
    activeStartup = await createFixtureStartup(founder.id)
    closedStartup = await createFixtureStartup(founder.id, { vote_threshold: 5 })
    negativeStartup = await createFixtureStartup(founder.id, {
      vote_threshold: 10,
      total_yes_votes: 0,
      total_no_votes: 5,
    })

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const balance = await balanceRes.json()
    expect(balance.total_spendable).toBe(100)

    // close one startup by crossing its threshold
    const castReq = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: closedStartup.id, direction: 'yes', votes: 5 }),
    })
    const castRes = await castVote(castReq)
    expect(castRes.status).toBe(200)
    const castBody = await castRes.json()
    expect(castBody.phase_closed).toBe(true)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [activeStartup.id, closedStartup.id, negativeStartup.id])
    await cleanupFixtures(founder.id, [])
  })

  it('returns startups across all phases, with phase and curve data for the one that closed into phase 2', async () => {
    const req = new Request('http://localhost:3000/api/startup-votes/list')
    const res = await listStartups(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      id: string
      slug: string
      phase: number
      total_yes_votes?: number
      curve?: {
        pool_usdc: string
        capital_target: string
        current_price: string
        progress: number
        graduated: boolean
        frozen: boolean
      }
    }>

    const ids = body.map((s) => s.id)
    expect(ids).toContain(activeStartup.id)
    expect(ids).toContain(negativeStartup.id)
    expect(ids).toContain(closedStartup.id)

    const active = body.find((s) => s.id === activeStartup.id)
    expect(active).toBeDefined()
    expect(active!.phase).toBe(1)
    expect(active!.total_yes_votes).toBeDefined()
    expect(active!.curve).toBeUndefined()

    const closed = body.find((s) => s.id === closedStartup.id)
    expect(closed).toBeDefined()
    expect(closed!.phase).toBe(2)
    expect(closed!.total_yes_votes).toBeUndefined()
    expect(closed!.curve).toBeDefined()
    expect(Number(closed!.curve!.capital_target)).toBeGreaterThan(0)
  })

  it('clamps progress to 0 when net is negative', async () => {
    const req = new Request('http://localhost:3000/api/startup-votes/list')
    const res = await listStartups(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string; progress: number }>

    const negative = body.find((s) => s.id === negativeStartup.id)
    expect(negative).toBeDefined()
    expect(negative!.progress).toBe(0)
  })
})
