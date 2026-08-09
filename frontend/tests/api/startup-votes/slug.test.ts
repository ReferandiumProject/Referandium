import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { GET as getStartup } from '@/app/api/startup-votes/[slug]/route'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('GET /api/startup-votes/[slug]', () => {
  let founder: Awaited<ReturnType<typeof createFixtureUser>>
  let user: Awaited<ReturnType<typeof createFixtureUser>>
  let closedStartup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    founder = await createFixtureUser()
    user = await createFixtureUser()
    closedStartup = await createFixtureStartup(founder.id, { vote_threshold: 5 })

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    const balance = await balanceRes.json()
    expect(balance.total_spendable).toBe(100)

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

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [closedStartup.id])
    await cleanupFixtures(founder.id, [])
  })

  it('returns 404 for an unknown slug', async () => {
    const req = new Request('http://localhost:3000/api/startup-votes/does-not-exist')
    const res = await getStartup(req, { params: { slug: 'does-not-exist' } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Startup not found/i)
  })

  it('returns a startup that has moved past phase 1', async () => {
    const req = new Request(`http://localhost:3000/api/startup-votes/${closedStartup.slug}`)
    const res = await getStartup(req, { params: { slug: closedStartup.slug } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(closedStartup.id)
    expect(body.phase).toBe(2)
    expect(body.progress).toBe(100)
  })
})
