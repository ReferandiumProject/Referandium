import { describe, it, expect, vi } from 'vitest'
import { GET as getMine } from '@/app/api/startup-votes/mine/route'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { POST as withdrawVote } from '@/app/api/startup-votes/withdraw/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('GET /api/startup-votes/mine', () => {
  async function callMine(user?: { id: string }) {
    const req = new Request('http://localhost:3000/api/startup-votes/mine', {
      headers: user ? { Authorization: 'Bearer mock-token' } : {},
    })
    return getMine(req)
  }

  async function cast(user: { id: string }, startupId: string, votes: number) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const req = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startupId, direction: 'yes', votes }),
    })
    const res = await castVote(req)
    expect(res.status).toBe(200)
  }

  async function withdraw(user: { id: string }, startupId: string, votes: number) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const req = new Request('http://localhost:3000/api/startup-votes/withdraw', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ startup_id: startupId, votes }),
    })
    const res = await withdrawVote(req)
    expect(res.status).toBe(200)
  }

  async function seedGrant(user: { id: string }) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    const res = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
      headers: { Authorization: 'Bearer mock-token' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total_spendable).toBe(100)
  }

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('Unauthorized'))
    const res = await callMine()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/Unauthorized/i)
  })

  it('returns empty active and burned positions plus a valid balance for a new user', async () => {
    const user = await createFixtureUser()
    try {
      await seedGrant(user)
      const res = await callMine(user)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.balance.remaining_today).toBe(100)
      expect(body.balance.pool_balance).toBe(0)
      expect(body.balance.total_spendable).toBe(100)
      expect(body.active).toEqual([])
      expect(body.burned).toEqual([])
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('includes an active position after casting votes', async () => {
    const user = await createFixtureUser()
    const startup = await createFixtureStartup(user.id)
    try {
      await seedGrant(user)
      await cast(user, startup.id, 12)

      const res = await callMine(user)
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.active).toHaveLength(1)
      const pos = body.active[0]
      expect(pos.startup_id).toBe(startup.id)
      expect(pos.name).toBe(startup.name)
      expect(pos.slug).toBe(startup.slug)
      expect(pos.direction).toBe('yes')
      expect(pos.votes).toBe(12)
      expect(pos.phase).toBe(1)
      expect(pos.total_yes_votes).toBe(12)
      expect(pos.total_no_votes).toBe(0)

      expect(body.burned).toEqual([])
      expect(body.balance.remaining_today).toBe(88)
    } finally {
      await cleanupFixtures(user.id, [startup.id])
    }
  })

  it('removes a position from active after it is fully withdrawn', async () => {
    const user = await createFixtureUser()
    const startup = await createFixtureStartup(user.id)
    try {
      await seedGrant(user)
      await cast(user, startup.id, 10)
      await withdraw(user, startup.id, 10)

      const res = await callMine(user)
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.active).toEqual([])
      expect(body.burned).toEqual([])
    } finally {
      await cleanupFixtures(user.id, [startup.id])
    }
  })

  it('moves a position to burned after its startup crosses the threshold', async () => {
    const user = await createFixtureUser()
    const startup = await createFixtureStartup(user.id, { vote_threshold: 5 })
    try {
      await seedGrant(user)
      await cast(user, startup.id, 5)

      const res = await callMine(user)
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.active).toEqual([])
      expect(body.burned).toHaveLength(1)

      const pos = body.burned[0]
      expect(pos.startup_id).toBe(startup.id)
      expect(pos.direction).toBe('yes')
      expect(pos.votes).toBe(5)
      expect(pos.phase).toBe(2)
      expect(pos.burned_at).not.toBeNull()

      expect(body.balance.remaining_today).toBe(95)
    } finally {
      await cleanupFixtures(user.id, [startup.id])
    }
  })
})
