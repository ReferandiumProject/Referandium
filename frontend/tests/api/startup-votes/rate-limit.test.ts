import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, createFixtureStartup, cleanupFixtures } from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('POST /api/startup-votes/cast rate limit', () => {
  let user: Awaited<ReturnType<typeof createFixtureUser>>
  let startup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    user = await createFixtureUser()
    startup = await createFixtureStartup(user.id)
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    // Seed the vote event table enough to exceed the 60/minute limit.
    const rows = Array.from({ length: 65 }).map(() => ({
      user_id: user.id,
      startup_id: startup.id,
      event_type: 'deploy',
      from_direction: null as string | null,
      to_direction: 'yes' as const,
      votes: 1,
      source: 'grant' as const,
    }))

    const { error } = await supabaseAdmin.from('startup_vote_events').insert(rows as any)
    if (error) {
      throw new Error(`Failed to seed vote events: ${error.message}`)
    }
  })

  afterAll(async () => {
    await cleanupFixtures(user.id, [startup.id])
  })

  it('returns 429 when the user exceeds the vote rate limit and does not create a row or change balances', async () => {
    const beforeEvents = await countVoteEvents(user.id)
    const beforeStartup = await currentStartup(startup.id)

    const req = new Request('http://localhost:3000/api/startup-votes/cast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ startup_id: startup.id, direction: 'yes', votes: 1 }),
    })

    const res = await castVote(req)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/rate limit/i)

    const afterEvents = await countVoteEvents(user.id)
    expect(afterEvents).toBe(beforeEvents)

    const afterStartup = await currentStartup(startup.id)
    expect(afterStartup.total_yes_votes).toBe(beforeStartup.total_yes_votes)
    expect(afterStartup.total_no_votes).toBe(beforeStartup.total_no_votes)
  })
})

async function countVoteEvents(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('startup_vote_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function currentStartup(startupId: string) {
  const { data, error } = await supabaseAdmin
    .from('startup_startups')
    .select('total_yes_votes, total_no_votes')
    .eq('id', startupId)
    .single()
  if (error) throw new Error(error.message)
  return data
}
