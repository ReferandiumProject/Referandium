import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { GET as myStartups } from '@/app/api/my-startups/route'
import { PATCH as patchMyStartup } from '@/app/api/my-startups/[id]/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import {
  createMyStartupsFixtureUser,
  createMyStartupsFixtureStartup,
  cleanupMyStartupsFixtures,
} from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const userIds: string[] = []
const startupIds: string[] = []

afterAll(async () => {
  await cleanupMyStartupsFixtures(userIds, startupIds)
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeGetRequest(authUser?: { id: string; email: string }) {
  if (authUser) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  } else {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('Unauthorized'))
  }
  const headers: Record<string, string> = {}
  if (authUser) headers.Authorization = 'Bearer mock-token'
  return new Request('http://localhost:3000/api/my-startups', { method: 'GET', headers })
}

function makePatchRequest(authUser: { id: string; email: string }, startupId: string, body: any) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  return new Request(`http://localhost:3000/api/my-startups/${startupId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function fetchStartupRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from('startup_startups')
    .select('id, user_id, name, slug, description, pitch, website, twitter, logo_url, stage, deleted_at')
    .eq('id', id)
    .single()
  if (error) throw new Error(`fetchStartupRow failed: ${error.message}`)
  return data
}

describe('/api/my-startups', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await myStartups(makeGetRequest())
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/Unauthorized/i)
  })

  it('returns only the caller\'s own startups, never another user\'s', async () => {
    const owner = await createMyStartupsFixtureUser()
    userIds.push(owner.id)
    const other = await createMyStartupsFixtureUser()
    userIds.push(other.id)

    const ownStartup = await createMyStartupsFixtureStartup(owner.id, { name: 'Owner Startup' })
    startupIds.push(ownStartup.id)
    const otherStartup = await createMyStartupsFixtureStartup(other.id, { name: 'Other Startup' })
    startupIds.push(otherStartup.id)

    const res = await myStartups(makeGetRequest(owner))
    expect(res.status).toBe(200)
    const json = await res.json()

    const ids = json.map((s: any) => s.id)
    expect(ids).toContain(ownStartup.id)
    expect(ids).not.toContain(otherStartup.id)
    expect(json.every((s: any) => s.id !== otherStartup.id)).toBe(true)

    const row = json.find((s: any) => s.id === ownStartup.id)
    expect(row.name).toBe('Owner Startup')
    expect(typeof row.capital_target).toBe('string')
    expect(row.founder_stats).toBeDefined()
    expect(typeof row.founder_stats.platform_fees_generated).toBe('string')
    // Phase 1 startup: no curve state yet.
    expect(row.curve).toBeNull()
  })

  it('excludes soft-deleted startups', async () => {
    const owner = await createMyStartupsFixtureUser()
    userIds.push(owner.id)

    const activeStartup = await createMyStartupsFixtureStartup(owner.id, { name: 'Active Startup' })
    startupIds.push(activeStartup.id)
    const deletedStartup = await createMyStartupsFixtureStartup(owner.id, {
      name: 'Deleted Startup',
      deletedAt: new Date().toISOString(),
    })
    startupIds.push(deletedStartup.id)

    const res = await myStartups(makeGetRequest(owner))
    expect(res.status).toBe(200)
    const json = await res.json()

    const ids = json.map((s: any) => s.id)
    expect(ids).toContain(activeStartup.id)
    expect(ids).not.toContain(deletedStartup.id)
  })

  it('updates a permitted field successfully', async () => {
    const owner = await createMyStartupsFixtureUser()
    userIds.push(owner.id)
    const startup = await createMyStartupsFixtureStartup(owner.id, { pitch: 'Old pitch' })
    startupIds.push(startup.id)

    const res = await patchMyStartup(
      makePatchRequest(owner, startup.id, { pitch: 'New pitch' }),
      { params: { id: startup.id } }
    )
    expect(res.status).toBe(200)

    const row = await fetchStartupRow(startup.id)
    expect(row.pitch).toBe('New pitch')
  })

  it('rejects a non-owner PATCH with 403 and leaves the startup unchanged', async () => {
    const owner = await createMyStartupsFixtureUser()
    userIds.push(owner.id)
    const attacker = await createMyStartupsFixtureUser()
    userIds.push(attacker.id)
    const startup = await createMyStartupsFixtureStartup(owner.id, { pitch: 'Original pitch' })
    startupIds.push(startup.id)

    const res = await patchMyStartup(
      makePatchRequest(attacker, startup.id, { pitch: 'Hijacked pitch' }),
      { params: { id: startup.id } }
    )
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/do not own/i)

    const row = await fetchStartupRow(startup.id)
    expect(row.pitch).toBe('Original pitch')
  })

  it('does not allow name, slug, vote_threshold, or capital_target to be changed', async () => {
    const owner = await createMyStartupsFixtureUser()
    userIds.push(owner.id)
    const startup = await createMyStartupsFixtureStartup(owner.id, { name: 'Fixed Name' })
    startupIds.push(startup.id)

    const res = await patchMyStartup(
      makePatchRequest(owner, startup.id, {
        name: 'Renamed',
        slug: 'renamed-slug',
        vote_threshold: 99999,
        capital_target: 99999,
        pitch: 'Updated via same request',
      }),
      { params: { id: startup.id } }
    )
    expect(res.status).toBe(200)

    const row = await fetchStartupRow(startup.id)
    expect(row.name).toBe('Fixed Name')
    expect(row.slug).toBe(startup.slug)
    expect(row.pitch).toBe('Updated via same request')

    const { data: full } = await supabaseAdmin
      .from('startup_startups')
      .select('vote_threshold, capital_target')
      .eq('id', startup.id)
      .single()
    expect(Number(full!.vote_threshold)).toBe(10)
    expect(Number(full!.capital_target)).toBe(100)
  })
})
