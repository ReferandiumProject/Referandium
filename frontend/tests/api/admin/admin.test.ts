import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { GET as listStartups } from '@/app/api/admin/startups/route'
import { GET as listStuck } from '@/app/api/admin/stuck-investment-packs/route'
import { GET as listStuckWithdrawals } from '@/app/api/admin/stuck-withdrawals/route'
import { GET as getTreasury } from '@/app/api/admin/treasury/route'
import { PATCH as patchStartup } from '@/app/api/admin/startups/[id]/route'
import { POST as deleteStartup } from '@/app/api/admin/startups/[id]/delete/route'
import { POST as restoreStartup } from '@/app/api/admin/startups/[id]/restore/route'
import { POST as forcePhase2 } from '@/app/api/admin/startups/[id]/force-phase2/route'
import { POST as freezeStartup } from '@/app/api/admin/startups/[id]/freeze/route'
import { POST as resumeGraduation } from '@/app/api/admin/graduations/[id]/resume/route'
import { GET as listActions } from '@/app/api/admin/actions/route'
import { GET as getGraduations } from '@/app/api/admin/graduations/route'
import { GET as getUnknownWithdrawals } from '@/app/api/admin/unknown-withdrawals/route'
import { GET as getLedger } from '@/app/api/admin/ledger/route'
import { GET as publicList } from '@/app/api/startup-votes/list/route'
import { GET as publicSlug } from '@/app/api/startup-votes/[slug]/route'
import { GET as getBalance } from '@/app/api/startup-votes/balance/route'
import { POST as castVote } from '@/app/api/startup-votes/cast/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createFixtureUser, createFixtureStartup, cleanupAdminFixtures } from './fixtures'
import {
  createCurveFixtureUser,
  createCurveFixtureStartup,
  crossToPhase2,
  cleanupCurveFixtures,
} from '../curve/fixtures'
import { supabaseAdmin } from '@/lib/supabaseServer'

let rpcSpy: any
const realRpc = (supabaseAdmin.rpc as any).bind(supabaseAdmin)

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/graduation/resume', () => ({
  resumeGraduation: vi.fn().mockResolvedValue({ ok: true }),
  runResumeWork: vi.fn(),
}))

describe('admin routes', () => {
  let admin: Awaited<ReturnType<typeof createFixtureUser>>
  let nonAdmin: Awaited<ReturnType<typeof createFixtureUser>>
  let voter: Awaited<ReturnType<typeof createFixtureUser>>
  let phase1Startup: Awaited<ReturnType<typeof createFixtureStartup>>
  let phase2Startup: Awaited<ReturnType<typeof createFixtureStartup>>
  let deletedStartup: Awaited<ReturnType<typeof createFixtureStartup>>
  let forcePhaseStartup: Awaited<ReturnType<typeof createFixtureStartup>>

  beforeAll(async () => {
    admin = await createFixtureUser('admin-test@example.com')
    nonAdmin = await createFixtureUser('not-admin@example.com')
    voter = await createFixtureUser('voter@example.com')
    phase1Startup = await createFixtureStartup(admin.id, { vote_threshold: 20 })
    phase2Startup = await createFixtureStartup(admin.id, { phase: 2 })
    deletedStartup = await createFixtureStartup(admin.id)
    forcePhaseStartup = await createFixtureStartup(admin.id)

    await supabaseAdmin
      .from('startup_startups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedStartup.id)

    process.env.ADMIN_EMAILS = admin.email

    rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
      if (name === 'admin_force_phase2') {
        const { p_startup_id } = params ?? {}
        if (p_startup_id) {
          await supabaseAdmin
            .from('startup_startups')
            .update({ phase: 2 })
            .eq('id', p_startup_id)
        }
        return { data: { ok: true }, error: null } as any
      }
      return realRpc(name, params)
    })
  })

  afterAll(async () => {
    await cleanupAdminFixtures(
      [admin.id, nonAdmin.id, voter.id],
      [phase1Startup?.id, phase2Startup?.id, deletedStartup?.id, forcePhaseStartup?.id].filter(Boolean) as string[]
    )
    rpcSpy?.mockRestore()
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
        { method: listStuck, path: '/api/admin/stuck-investment-packs' },
        { method: listStuckWithdrawals, path: '/api/admin/stuck-withdrawals' },
        { method: getTreasury, path: '/api/admin/treasury' },
        { method: getGraduations, path: '/api/admin/graduations' },
        { method: getUnknownWithdrawals, path: '/api/admin/unknown-withdrawals' },
        { method: getLedger, path: '/api/admin/ledger' },
        { method: listActions, path: '/api/admin/actions' },
        { method: patchStartup, path: `/api/admin/startups/${phase1Startup.id}`, body: { name: 'X' }, ctx: { params: { id: phase1Startup.id } } },
        { method: deleteStartup, path: `/api/admin/startups/${phase1Startup.id}/delete`, ctx: { params: { id: phase1Startup.id } } },
        { method: restoreStartup, path: `/api/admin/startups/${phase1Startup.id}/restore`, ctx: { params: { id: phase1Startup.id } } },
        { method: forcePhase2, path: `/api/admin/startups/${phase1Startup.id}/force-phase2`, ctx: { params: { id: phase1Startup.id } } },
        { method: freezeStartup, path: `/api/admin/startups/${phase1Startup.id}/freeze`, body: { frozen: true }, ctx: { params: { id: phase1Startup.id } } },
        { method: resumeGraduation, path: `/api/admin/graduations/${phase1Startup.id}/resume`, body: { idempotency_key: '11111111-1111-1111-1111-111111111111' }, ctx: { params: { id: phase1Startup.id } } },
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
        { method: listStuck, path: '/api/admin/stuck-investment-packs' },
        { method: listStuckWithdrawals, path: '/api/admin/stuck-withdrawals' },
        { method: getTreasury, path: '/api/admin/treasury' },
        { method: getGraduations, path: '/api/admin/graduations' },
        { method: getUnknownWithdrawals, path: '/api/admin/unknown-withdrawals' },
        { method: getLedger, path: '/api/admin/ledger' },
        { method: listActions, path: '/api/admin/actions' },
        { method: patchStartup, path: `/api/admin/startups/${phase1Startup.id}`, body: { name: 'X' } },
        { method: deleteStartup, path: `/api/admin/startups/${phase1Startup.id}/delete` },
        { method: restoreStartup, path: `/api/admin/startups/${phase1Startup.id}/restore` },
        { method: forcePhase2, path: `/api/admin/startups/${phase1Startup.id}/force-phase2` },
        { method: freezeStartup, path: `/api/admin/startups/${phase1Startup.id}/freeze`, body: { frozen: true } },
        { method: resumeGraduation, path: `/api/admin/graduations/${phase1Startup.id}/resume`, body: { idempotency_key: '11111111-1111-1111-1111-111111111111' } },
      ]

      for (const e of endpoints) {
        const r = req(e.method.name === 'PATCH' ? 'PATCH' : 'POST', e.path, e.body, nonAdmin)
        const res = await e.method(r, { params: { id: phase1Startup.id } })
        expect(res.status, `${e.path} should be 403`).toBe(403)
        const json = await res.json()
        expect(json, `${e.path} should not leak data in 403 body`).toMatchObject({ error: 'Forbidden' })
        expect(Array.isArray(json), `${e.path} should not be an array`).toBe(false)
        expect(json.backed_liability_exact, `${e.path} should not contain backed_liability_exact`).toBeUndefined()
      }
    })

    it('POST /api/admin/graduations/[id]/resume 403 is not vacuous', async () => {
      const original = process.env.ADMIN_EMAILS
      try {
        process.env.ADMIN_EMAILS = nonAdmin.email
        vi.mocked(getAuthenticatedUser).mockResolvedValue(nonAdmin as any)
        const res = await resumeGraduation(
          req(
            'POST',
            `/api/admin/graduations/${phase1Startup.id}/resume`,
            { idempotency_key: '11111111-1111-1111-1111-111111111111' },
            nonAdmin
          ),
          { params: { id: phase1Startup.id } }
        )
        expect(res.status).not.toBe(403)
      } finally {
        process.env.ADMIN_EMAILS = original
      }
    })

    it('GET /api/admin/graduations is 401 without auth', async () => {
      const res = await getGraduations(req('GET', '/api/admin/graduations'))
      expect(res.status).toBe(401)
    })

    it('GET /api/admin/graduations returns 403 and no data for non-admin', async () => {
      const res = await getGraduations(req('GET', '/api/admin/graduations', undefined, nonAdmin))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json).toMatchObject({ error: 'Forbidden' })
      expect(Array.isArray(json)).toBe(false)
    })

    it('GET /api/admin/unknown-withdrawals is 401 without auth', async () => {
      const res = await getUnknownWithdrawals(req('GET', '/api/admin/unknown-withdrawals'))
      expect(res.status).toBe(401)
    })

    it('GET /api/admin/unknown-withdrawals returns 403 and no data for non-admin', async () => {
      const res = await getUnknownWithdrawals(req('GET', '/api/admin/unknown-withdrawals', undefined, nonAdmin))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json).toMatchObject({ error: 'Forbidden' })
      expect(Array.isArray(json)).toBe(false)
    })

    it('GET /api/admin/ledger is 401 without auth', async () => {
      const res = await getLedger(req('GET', '/api/admin/ledger'))
      expect(res.status).toBe(401)
    })

    it('GET /api/admin/ledger returns 403 and no data for non-admin', async () => {
      const res = await getLedger(req('GET', '/api/admin/ledger', undefined, nonAdmin))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json).toMatchObject({ error: 'Forbidden' })
      expect(json.backed_liability_exact).toBeUndefined()
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

  describe('success paths', () => {
    it('GET /api/admin/startups returns all startups including deleted with expected fields', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await listStartups(req('GET', '/api/admin/startups', undefined, admin))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)

      const byId = Object.fromEntries(json.map((s: any) => [s.id, s]))
      expect(byId[phase1Startup.id]).toMatchObject({
        id: phase1Startup.id,
        user_id: admin.id,
        name: phase1Startup.name,
        slug: phase1Startup.slug,
        phase: 1,
        vote_threshold: phase1Startup.vote_threshold,
        capital_target: phase1Startup.capital_target,
        total_yes_votes: expect.any(Number),
        total_no_votes: expect.any(Number),
        deleted_at: null,
      })
      expect(byId[phase2Startup.id]).toMatchObject({
        id: phase2Startup.id,
        phase: 2,
      })
      expect(byId[deletedStartup.id]).toBeDefined()
      expect(byId[deletedStartup.id].deleted_at).not.toBeNull()
    })

    it('PATCH /api/admin/startups/[id] updates allowed fields', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await patchStartup(
        req('PATCH', `/api/admin/startups/${phase1Startup.id}`, { name: 'Updated Name', stage: 'Series A' }, admin),
        { params: { id: phase1Startup.id } }
      )
      expect(res.status).toBe(200)

      const { data: row, error } = await supabaseAdmin
        .from('startup_startups')
        .select('name, stage')
        .eq('id', phase1Startup.id)
        .single()
      expect(error).toBeNull()
      expect(row?.name).toBe('Updated Name')
      expect(row?.stage).toBe('Series A')
    })

    it('POST /api/admin/startups/[id]/force-phase2 moves a phase-1 startup to phase 2', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await forcePhase2(
        req('POST', `/api/admin/startups/${forcePhaseStartup.id}/force-phase2`, { reason: 'test force' }, admin),
        { params: { id: forcePhaseStartup.id } }
      )
      expect(res.status).toBe(200)

      const { data: row, error } = await supabaseAdmin
        .from('startup_startups')
        .select('phase')
        .eq('id', forcePhaseStartup.id)
        .single()
      expect(error).toBeNull()
      expect(row?.phase).toBe(2)
    })

    it('GET /api/admin/actions returns the audit log', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await listActions(req('GET', '/api/admin/actions', undefined, admin))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json)).toBe(true)
      expect(json.length).toBeGreaterThan(0)
      expect(json[0]).toHaveProperty('action')
      expect(json[0]).toHaveProperty('admin_email')
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

  describe('freeze / unfreeze curve', () => {
    let owner: Awaited<ReturnType<typeof createCurveFixtureUser>>
    let voter: Awaited<ReturnType<typeof createCurveFixtureUser>>
    let trader: Awaited<ReturnType<typeof createCurveFixtureUser>>
    let curveStartup: Awaited<ReturnType<typeof createCurveFixtureStartup>>
    const curveUserIds: string[] = []
    const curveStartupIds: string[] = []

    beforeAll(async () => {
      owner = await createCurveFixtureUser()
      voter = await createCurveFixtureUser()
      trader = await createCurveFixtureUser(1000)
      curveUserIds.push(owner.id, voter.id, trader.id)

      curveStartup = await createCurveFixtureStartup(owner.id, { capitalTarget: 100, voteThreshold: 10 })
      curveStartupIds.push(curveStartup.id)

      await crossToPhase2(curveStartup, voter.id)

      const buyRes = await supabaseAdmin.rpc('buy_curve_tokens', {
        p_user_id: trader.id,
        p_startup_id: curveStartup.id,
        p_usdc: 10,
      })
      if (buyRes.error) throw new Error(`Failed initial buy: ${buyRes.error.message}`)
    })

    afterAll(async () => {
      await cleanupCurveFixtures(curveUserIds, curveStartupIds)
    })

    it('returns 404 when freezing a startup with no curve', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await freezeStartup(
        req('POST', `/api/admin/startups/${phase2Startup.id}/freeze`, { frozen: true }, admin),
        { params: { id: phase2Startup.id } }
      )
      expect(res.status).toBe(404)
    })

    it('freezes a phase-2 startup and sets frozen_at', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await freezeStartup(
        req(
          'POST',
          `/api/admin/startups/${curveStartup.id}/freeze`,
          { frozen: true, reason: 'test freeze' },
          admin
        ),
        { params: { id: curveStartup.id } }
      )
      expect(res.status).toBe(200)

      const { data: row, error } = await supabaseAdmin
        .from('startup_curves')
        .select('frozen_at')
        .eq('startup_id', curveStartup.id)
        .single()
      expect(error).toBeNull()
      expect(row?.frozen_at).not.toBeNull()

      const { data: actionRows, error: actionsError } = await supabaseAdmin
        .from('admin_actions')
        .select('*')
        .eq('startup_id', curveStartup.id)
      expect(actionsError).toBeNull()
      expect((actionRows ?? []).length).toBeGreaterThan(0)
    })

    it('rejects a buy while frozen but still allows a sell', async () => {
      const buyRes = await supabaseAdmin.rpc('buy_curve_tokens', {
        p_user_id: trader.id,
        p_startup_id: curveStartup.id,
        p_usdc: 10,
      })
      expect(buyRes.error).not.toBeNull()

      const { data: holding, error: holdingError } = await supabaseAdmin
        .from('startup_holdings')
        .select('tokens::text')
        .eq('user_id', trader.id)
        .eq('startup_id', curveStartup.id)
        .single()
      expect(holdingError).toBeNull()

      const sellRes = await supabaseAdmin.rpc('sell_curve_tokens', {
        p_user_id: trader.id,
        p_startup_id: curveStartup.id,
        p_tokens: holding!.tokens,
      })
      expect(sellRes.error).toBeNull()
    })

    it('unfreezes, clears frozen_at, and allows buys again', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(admin as any)
      const res = await freezeStartup(
        req(
          'POST',
          `/api/admin/startups/${curveStartup.id}/freeze`,
          { frozen: false, reason: 'test unfreeze' },
          admin
        ),
        { params: { id: curveStartup.id } }
      )
      expect(res.status).toBe(200)

      const { data: row, error } = await supabaseAdmin
        .from('startup_curves')
        .select('frozen_at')
        .eq('startup_id', curveStartup.id)
        .single()
      expect(error).toBeNull()
      expect(row?.frozen_at).toBeNull()

      const buyRes = await supabaseAdmin.rpc('buy_curve_tokens', {
        p_user_id: trader.id,
        p_startup_id: curveStartup.id,
        p_usdc: 10,
      })
      expect(buyRes.error).toBeNull()
    })
  })
})
