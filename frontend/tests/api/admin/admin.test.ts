import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { GET as listStartups } from '@/app/api/admin/startups/route'
import { PATCH as patchStartup } from '@/app/api/admin/startups/[id]/route'
import { POST as deleteStartup } from '@/app/api/admin/startups/[id]/delete/route'
import { POST as restoreStartup } from '@/app/api/admin/startups/[id]/restore/route'
import { POST as forcePhase2 } from '@/app/api/admin/startups/[id]/force-phase2/route'
import { GET as listActions } from '@/app/api/admin/actions/route'
import { GET as publicList } from '@/app/api/startup-votes/list/route'
import { GET as publicSlug } from '@/app/api/startup-votes/[slug]/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createFixtureUser, createFixtureStartup, cleanupAdminFixtures } from './fixtures'
import { supabaseAdmin } from '@/lib/supabaseServer'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('admin routes', () => {
  let admin: Awaited<ReturnType<typeof createFixtureUser>>
  let nonAdmin: Awaited<ReturnType<typeof createFixtureUser>>
  let voter: Awaited<ReturnType<typeof createFixtureUser>>
  let phase1Startup: Awaited<ReturnType<typeof createFixtureStartup>>
  let phase2Startup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    admin = await createFixtureUser('admin-test@example.com')
    nonAdmin = await createFixtureUser('not-admin@example.com')
    voter = await createFixtureUser('voter@example.com')
    phase1Startup = await createFixtureStartup(admin.id, { vote_threshold: 20 })
    phase2Startup = await createFixtureStartup(admin.id, { phase: 2 })

    process.env.ADMIN_EMAILS = admin.email
  })

  afterAll(async () => {
    await cleanupAdminFixtures(
      [admin.id, nonAdmin.id, voter.id],
      [phase1Startup?.id, phase2Startup?.id].filter(Boolean) as string[]
    )
  })

  function req(
    method: string,
    path: string,
    body?: any,
    authUser?: Awaited<ReturnType<typeof createFixtureUser>>
  ) {
    const headers: Record<string, string> = {}
    if (authUser) {
      headers.Authorization = 'Bearer mock-token'
      vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
    } else {
      vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('Unauthorized'))
    }
    return new Request(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  describe('authentication and authorization', () => {
    it('returns 401 on all admin routes when unauthenticated', async () => {
      const endpoints: { method: (req: Request, ctx?: any) => Promise<Response>; path: string; body?: any; ctx?: any }[] = [
        { method: listStartups, path: '/api/admin/startups' },
        { method: listActions, path: '/api/admin/actions' },
        { method: patchStartup, path: `/api/admin/startups/${phase1Startup.id}`, body: { name: 'X' }, ctx: { params: { id: phase1Startup.id } } },
        { method: deleteStartup, path: `/api/admin/startups/${phase1Startup.id}/delete`, ctx: { params: { id: phase1Startup.id } } },
        { method: restoreStartup, path: `/api/admin/startups/${phase1Startup.id}/restore`, ctx: { params: { id: phase1Startup.id } } },
        { method: forcePhase2, path: `/api/admin/startups/${phase1Startup.id}/force-phase2`, ctx: { params: { id: phase1Startup.id } } },
      ]

      for (const e of endpoints) {
        const r = req(e.method.name === 'PATCH' ? 'PATCH' : 'POST', e.path, e.body)
        const res = await e.method(r, e.ctx ?? { params: { id: phase1Startup.id } })
        expect(res.status, `${e.path} should be 401`).toBe(401)
      }
    })

    it('returns 403 on all admin routes when authenticated but not an admin', async () => {
      const endpoints = [
        { method: listStartups, path: '/api/admin/startups' },
        { method: listActions, path: '/api/admin/actions' },
        { method: patchStartup, path: `/api/admin/startups/${phase1Startup.id}`, body: { name: 'X' } },
        { method: deleteStartup, path: `/api/admin/startups/${phase1Startup.id}/delete` },
        { method: restoreStartup, path: `/api/admin/startups/${phase1Startup.id}/restore` },
        { method: forcePhase2, path: `/api/admin/startups/${phase1Startup.id}/force-phase2` },
      ]

      for (const e of endpoints) {
        const r = req(e.method.name === 'PATCH' ? 'PATCH' : 'POST', e.path, e.body, nonAdmin)
        const res = await e.method(r, { params: { id: phase1Startup.id } })
        expect(res.status, `${e.path} should be 403`).toBe(403)
      }
    })
  })

  describe('soft delete and restore', () => {
    it('deletes a phase-1 startup and returns votes to the voter pool', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(voter as any)
      const balRes = await getBalance(req('GET', '/api/startup-votes/balance', undefined, voter))
      expect(balRes.status).toBe(200)

      const castRes = await castVote(
        req('POST', '/api/startup-votes/cast', { startup_id: phase1Startup.id, direction: 'yes', votes: 10 }, voter)
      )
      expect(castRes.status).toBe(200)

      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await deleteStartup(
        req('POST', `/api/admin/startups/${phase1Startup.id}/delete`, { reason: 'test' }, admin),
        { params: { id: phase1Startup.id } }
      )
      expect(res.status).toBe(200)

      const { data: row, error } = await supabaseAdmin
        .from('startup_startups')
        .select('deleted_at')
        .eq('id', phase1Startup.id)
        .single()
      expect(error).toBeNull()
      expect(row?.deleted_at).not.toBeNull()

      const { data: pool } = await supabaseAdmin
        .from('startup_vote_pool')
        .select('available')
        .eq('user_id', voter.id)
        .single()
      expect(Number(pool?.available ?? 0)).toBe(10)

      const { data: actions, error: actionError } = await supabaseAdmin
        .from('admin_actions')
        .select('*')
        .eq('startup_id', phase1Startup.id)
      expect(actionError).toBeNull()
      expect(actions ?? []).toHaveLength(actions?.length ?? 0)
      expect((actions ?? []).some((a: any) => a.action === 'delete_startup' || a.action === 'delete')).toBe(true)
    })

    it('hides deleted startups from public list and slug routes', async () => {
      const listRes = await publicList(req('GET', '/api/startup-votes/list'))
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json()
      expect(listJson.find((s: any) => s.id === phase1Startup.id)).toBeUndefined()

      const slugRes = await publicSlug(
        req('GET', `/api/startup-votes/${phase1Startup.slug}`),
        { params: { slug: phase1Startup.slug } }
      )
      expect(slugRes.status).toBe(404)
    })

    it('restore clears deleted_at', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await restoreStartup(
        req('POST', `/api/admin/startups/${phase1Startup.id}/restore`, {}, admin),
        { params: { id: phase1Startup.id } }
      )
      expect(res.status).toBe(200)

      const { data: row, error } = await supabaseAdmin
        .from('startup_startups')
        .select('deleted_at')
        .eq('id', phase1Startup.id)
        .single()
      expect(error).toBeNull()
      expect(row?.deleted_at).toBeNull()

      const { data: actions, error: actionError } = await supabaseAdmin
        .from('admin_actions')
        .select('*')
        .eq('startup_id', phase1Startup.id)
      expect(actionError).toBeNull()
      expect((actions ?? []).some((a: any) => a.action === 'restore_startup' || a.action === 'restore')).toBe(true)
    })
  })

  describe('phase restrictions', () => {
    it('rejects deleting a phase-2 startup', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await deleteStartup(
        req('POST', `/api/admin/startups/${phase2Startup.id}/delete`, {}, admin),
        { params: { id: phase2Startup.id } }
      )
      expect(res.status).toBe(409)
    })

    it('rejects editing the threshold on a phase-2 startup', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await patchStartup(
        req('PATCH', `/api/admin/startups/${phase2Startup.id}`, { vote_threshold: 50 }, admin),
        { params: { id: phase2Startup.id } }
      )
      expect(res.status).toBe(409)
    })
  })
})
