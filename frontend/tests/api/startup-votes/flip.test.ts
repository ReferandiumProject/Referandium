import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { POST as flipVote } from '@/app/api/startup-votes/flip/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('POST /api/startup-votes/flip', () => {
  describe('with an existing position', () => {
    let founder: Awaited<ReturnType<typeof createFixtureUser>>
    let user: Awaited<ReturnType<typeof createFixtureUser>>
    let startup: Awaited<ReturnType<typeof createFixtureStartup>>

    beforeAll(async () => {
      founder = await createFixtureUser()
      user = await createFixtureUser()
      startup = await createFixtureStartup(founder.id)

      // seed the daily grant and a position to flip
      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      const balanceRes = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
        headers: { Authorization: 'Bearer mock-token' },
      }))
      const balance = await balanceRes.json()
      expect(balance.total_spendable).toBe(100)

      const castReq = new Request('http://localhost:3000/api/startup-votes/cast', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startup.id, direction: 'yes', votes: 15 }),
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

    it('moves the whole position to the other side, updates totals, and consumes no votes', async () => {
      const balanceBefore = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
        headers: { Authorization: 'Bearer mock-token' },
      })).then((r) => r.json())

      const flipReq = new Request('http://localhost:3000/api/startup-votes/flip', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startup.id }),
      })
      const res = await flipVote(flipReq)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.new_direction).toBe('no')
      expect(body.votes).toBe(15)
      expect(body.net_votes).toBe(-15)
      expect(body.phase_closed).toBe(false)

      const { data: startupRow } = await supabaseAdmin
        .from('startup_startups')
        .select('total_yes_votes, total_no_votes')
        .eq('id', startup.id)
        .single()

      expect(startupRow!.total_yes_votes).toBe(0)
      expect(startupRow!.total_no_votes).toBe(15)

      const { data: allocation } = await supabaseAdmin
        .from('startup_vote_allocations')
        .select('direction, votes')
        .eq('user_id', user.id)
        .eq('startup_id', startup.id)
        .is('burned_at', null)
        .single()

      expect(allocation!.direction).toBe('no')
      expect(allocation!.votes).toBe(15)

      const balanceAfter = await getBalance(new Request('http://localhost:3000/api/startup-votes/balance', {
        headers: { Authorization: 'Bearer mock-token' },
      })).then((r) => r.json())

      expect(balanceAfter.remaining_today).toBe(balanceBefore.remaining_today)
      expect(balanceAfter.pool_balance).toBe(balanceBefore.pool_balance)
      expect(balanceAfter.total_spendable).toBe(balanceBefore.total_spendable)
    })
  })

  describe.sequential('with an existing position and an idempotency key', () => {
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
        body: JSON.stringify({ startup_id: startup.id, direction: 'yes', votes: 15 }),
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

    it('replays a flip with the same idempotency key without reversing direction or changing tallies', async () => {
      const key = '33333333-3333-3333-3333-333333333333'
      const firstReq = new Request('http://localhost:3000/api/startup-votes/flip', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startup.id, idempotency_key: key }),
      })
      const firstRes = await flipVote(firstReq)
      expect(firstRes.status).toBe(200)
      const first = await firstRes.json()
      expect(first.already_flipped).toBe(false)

      const { data: talliesBefore } = await supabaseAdmin
        .from('startup_startups')
        .select('total_yes_votes, total_no_votes')
        .eq('id', startup.id)
        .single()

      const secondReq = new Request('http://localhost:3000/api/startup-votes/flip', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startup.id, idempotency_key: key }),
      })
      const secondRes = await flipVote(secondReq)
      expect(secondRes.status).toBe(200)
      const second = await secondRes.json()
      expect(second.already_flipped).toBe(true)
      expect(second.new_direction).toBe(first.new_direction)
      expect(second.votes).toBe(first.votes)
      expect(second.net_votes).toBe(first.net_votes)

      const { data: talliesAfter } = await supabaseAdmin
        .from('startup_startups')
        .select('total_yes_votes, total_no_votes')
        .eq('id', startup.id)
        .single()

      expect(talliesAfter!.total_yes_votes).toBe(talliesBefore!.total_yes_votes)
      expect(talliesAfter!.total_no_votes).toBe(talliesBefore!.total_no_votes)

      const { data: allocation } = await supabaseAdmin
        .from('startup_vote_allocations')
        .select('direction, votes')
        .eq('user_id', user.id)
        .eq('startup_id', startup.id)
        .is('burned_at', null)
        .single()

      expect(allocation!.direction).toBe(first.new_direction)
      expect(allocation!.votes).toBe(first.votes)
    })

    it('returns 409 when the same idempotency key is used for a different startup', async () => {
      const other = await createFixtureStartup(founder.id)
      const key = '44444444-4444-4444-4444-444444444444'

      const firstReq = new Request('http://localhost:3000/api/startup-votes/flip', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startup.id, idempotency_key: key }),
      })
      const firstRes = await flipVote(firstReq)
      expect(firstRes.status).toBe(200)

      const secondReq = new Request('http://localhost:3000/api/startup-votes/flip', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: other.id, idempotency_key: key }),
      })
      const secondRes = await flipVote(secondReq)
      expect(secondRes.status).toBe(409)

      await cleanupFixtures(user.id, [other.id])
    })
  })

  describe('without an existing position', () => {
    let founder: Awaited<ReturnType<typeof createFixtureUser>>
    let user: Awaited<ReturnType<typeof createFixtureUser>>
    let startup: Awaited<ReturnType<typeof createFixtureStartup>>

    beforeAll(async () => {
      founder = await createFixtureUser()
      user = await createFixtureUser()
      startup = await createFixtureStartup(founder.id)
    })

    beforeEach(() => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    })

    afterAll(async () => {
      await cleanupFixtures(user.id, [startup.id])
      await cleanupFixtures(founder.id, [])
    })

    it('returns 404', async () => {
      const req = new Request('http://localhost:3000/api/startup-votes/flip', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startup.id }),
      })
      const res = await flipVote(req)
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toMatch(/No votes deployed/i)
    })
  })
})
