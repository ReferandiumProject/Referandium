import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resumeGraduation, runResumeWork } from '@/lib/graduation/resume'
import { mintGraduationToken } from '@/lib/graduation/mint'
import { createGraduationPool } from '@/lib/graduation/pool'
import { burnLpTokens } from '@/lib/graduation/burn'
import { payFounder } from '@/lib/graduation/pay-founder'
import { revokeMintAuthority, completeGraduation } from '@/lib/graduation/revoke'

vi.mock('@/lib/graduation/mint', () => ({
  mintGraduationToken: vi.fn(),
}))

vi.mock('@/lib/graduation/pool', () => ({
  createGraduationPool: vi.fn(),
}))

vi.mock('@/lib/graduation/burn', () => ({
  burnLpTokens: vi.fn(),
}))

vi.mock('@/lib/graduation/pay-founder', () => ({
  payFounder: vi.fn(),
}))

vi.mock('@/lib/graduation/revoke', () => ({
  revokeMintAuthority: vi.fn(),
  completeGraduation: vi.fn(),
}))

interface Scenario {
  graduationId: string
  graduationStatus: string
  haltedReason?: string | null
  previousStatus?: string | null
  calls: any[]
}

class MockBuilder {
  constructor(
    private scenario: Scenario,
    private table: string,
    private kind?: 'insert' | 'select' | 'update',
    private payload?: any,
    private returning?: string
  ) {}

  insert(data: any) {
    return new MockBuilder(this.scenario, this.table, 'insert', data)
  }

  select(columns?: string) {
    if (this.kind === 'update') {
      return new MockBuilder(this.scenario, this.table, 'update', this.payload, columns)
    }
    return new MockBuilder(this.scenario, this.table, 'select', columns)
  }

  update(data: any) {
    return new MockBuilder(this.scenario, this.table, 'update', data)
  }

  eq(_col: string, _val: any) {
    return new MockBuilder(this.scenario, this.table, this.kind, this.payload, this.returning)
  }

  in(_col: string, _vals: any[]) {
    return new MockBuilder(this.scenario, this.table, this.kind, this.payload, this.returning)
  }

  order(_col: string, _opts?: any) {
    return new MockBuilder(this.scenario, this.table, this.kind, this.payload, this.returning)
  }

  limit(_n: number) {
    return new MockBuilder(this.scenario, this.table, this.kind, this.payload, this.returning)
  }

  single() {
    return this.resolve(false)
  }

  maybeSingle() {
    return this.resolve(true)
  }

  then(onF: (v: any) => any, onR?: (e: any) => any) {
    return this.resolve(false).then(onF, onR)
  }

  private async resolve(maybe: boolean) {
    const { scenario, table, kind, payload, returning } = this
    scenario.calls.push({ table, kind, payload, returning })

    if (kind === 'insert') {
      return { data: payload, error: null }
    }

    if (kind === 'update') {
      if (table === 'graduations') {
        if (returning === 'id') {
          // claimHaltedGraduation conditional update
          if (scenario.graduationStatus === 'halted') {
            if (payload.status !== undefined) {
              scenario.graduationStatus = payload.status
            }
            if (payload.halted_reason !== undefined) {
              scenario.haltedReason = payload.halted_reason
            }
            return { data: { id: scenario.graduationId }, error: null }
          }
          return { data: null, error: { message: 'No rows' } }
        }

        if (payload.status !== undefined) {
          scenario.graduationStatus = payload.status
        }
        if (payload.halted_reason !== undefined) {
          scenario.haltedReason = payload.halted_reason
        }
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    if (kind === 'select') {
      if (table === 'graduations') {
        return {
          data: {
            status: scenario.graduationStatus,
            halted_reason: scenario.haltedReason ?? null,
            authority_revoke_signature: null,
            pool_address: null,
            lp_mint_address: null,
            lp_token_account: null,
          },
          error: null,
        }
      }

      if (table === 'graduation_events' && payload === 'from_status') {
        if (scenario.previousStatus == null) {
          return maybe
            ? { data: null, error: null }
            : { data: null, error: { message: 'No rows' } }
        }
        return { data: { from_status: scenario.previousStatus }, error: null }
      }

      return maybe
        ? { data: null, error: null }
        : { data: null, error: { message: 'No rows' } }
    }

    return { data: null, error: null }
  }
}

function createMockSupabase(scenario: Partial<Scenario> = {}) {
  const fullScenario: Scenario = {
    graduationId: 'grad-1',
    graduationStatus: 'halted',
    haltedReason: null,
    previousStatus: 'minting',
    calls: [],
    ...scenario,
  }
  return {
    supabase: {
      from: (table: string) => new MockBuilder(fullScenario, table),
    },
    scenario: fullScenario,
  }
}

function makeAdmin() {
  return {
    id: 'admin-1',
    privy_id: 'admin:actor',
    email: 'admin@example.com',
    wallet_address: '0xAdminWallet',
    custodial_wallet_address: null,
  }
}

function setDefaultSteps() {
  ;(mintGraduationToken as any).mockImplementation(async (graduationId: string, deps: any) => {
    await deps?.supabase?.from('graduations').update({ status: 'minted' }).eq('id', graduationId)
    return {
      success: true,
      mintAddress: 'mock-mint',
      escrowAddress: 'mock-escrow',
      signatures: { mint: 'mock', metadata: 'mock', escrowFund: 'mock' },
    }
  })

  ;(createGraduationPool as any).mockImplementation(async (graduationId: string, deps: any) => {
    await deps?.supabase?.from('graduations').update({ status: 'pooled' }).eq('id', graduationId)
    return { success: true, poolAddress: 'mock-pool' }
  })

  ;(burnLpTokens as any).mockImplementation(async (graduationId: string, deps: any) => {
    await deps?.supabase?.from('graduations').update({ status: 'burned' }).eq('id', graduationId)
    return { success: true, signature: 'mock-burn' }
  })

  ;(payFounder as any).mockImplementation(async (graduationId: string, deps: any) => {
    await deps?.supabase?.from('graduations').update({ status: 'founder_paid' }).eq('id', graduationId)
    return {
      success: true,
      founderBalanceBefore: '0',
      founderBalanceAfter: '0',
      treasuryBalanceBefore: '0',
      treasuryBalanceAfter: '0',
      amount: '0',
    }
  })

  ;(revokeMintAuthority as any).mockImplementation(async (graduationId: string, deps: any) => {
    await deps?.supabase?.from('graduations').update({ status: 'revoking' }).eq('id', graduationId)
    return {
      txId: 'mock-revoke-tx',
      supply: '0',
      mintAuthority: null,
      freezeAuthority: null,
      escrowBalance: '0',
    }
  })

  ;(completeGraduation as any).mockImplementation(async (graduationId: string, _signature: string, deps: any) => {
    await deps?.supabase?.from('graduations').update({ status: 'complete' }).eq('id', graduationId)
    return {
      authorityRevokeSignature: 'mock-revoke-tx',
      ledgerLiabilityBefore: '0',
      ledgerLiabilityAfter: '0',
    }
  })
}

function make55006(expected: string, actual: string) {
  const err: any = new Error(`SQLSTATE 55006: expected ${expected} but found ${actual}`)
  err.code = '55006'
  return err
}

describe('resumeGraduation (mocked client)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultSteps()
  })

  it('claims a halted graduation, records the admin actor, and performs one step', async () => {
    const { supabase, scenario } = createMockSupabase({
      graduationStatus: 'halted',
      previousStatus: 'minting',
    })

    const result = await resumeGraduation('grad-1', makeAdmin(), { supabase: supabase as any })

    expect(result).toMatchObject({
      graduation_id: 'grad-1',
      previous_status: 'minting',
      status: 'minted',
      resumed_by: 'admin:actor',
    })

    const eventInsert = scenario.calls.find(
      (c) => c.table === 'graduation_events' && c.kind === 'insert'
    )
    expect(eventInsert).toBeDefined()
    expect(eventInsert.payload).toMatchObject({
      from_status: 'halted',
      to_status: 'minting',
      actor: 'admin:actor',
      note: 'Resumed by admin:actor',
    })

    expect(vi.mocked(mintGraduationToken)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createGraduationPool)).not.toHaveBeenCalled()
  })

  it('performs one step from a non-halted graduation and does not attempt a halted claim', async () => {
    const { supabase, scenario } = createMockSupabase({
      graduationStatus: 'minted',
      previousStatus: null,
    })

    const result = await resumeGraduation('grad-1', makeAdmin(), { supabase: supabase as any })

    expect(result).toMatchObject({
      graduation_id: 'grad-1',
      previous_status: 'minted',
      status: 'pooled',
      resumed_by: 'admin:actor',
    })

    const claimUpdate = scenario.calls.find(
      (c) =>
        c.table === 'graduations' &&
        c.kind === 'update' &&
        c.returning === 'id' &&
        c.payload?.halted_reason === null
    )
    expect(claimUpdate).toBeUndefined()

    const eventInsert = scenario.calls.find(
      (c) => c.table === 'graduation_events' && c.kind === 'insert'
    )
    expect(eventInsert).toBeUndefined()

    expect(vi.mocked(createGraduationPool)).toHaveBeenCalledTimes(1)
  })

  it('rejects a halted graduation with no previous status recorded', async () => {
    const { supabase, scenario } = createMockSupabase({
      graduationStatus: 'halted',
      previousStatus: null,
    })

    await expect(
      resumeGraduation('grad-1', makeAdmin(), { supabase: supabase as any })
    ).rejects.toThrow(/no previous status/i)

    const claimUpdate = scenario.calls.find(
      (c) => c.table === 'graduations' && c.kind === 'update' && c.returning === 'id'
    )
    expect(claimUpdate).toBeUndefined()
  })

  it('returns the current status and does not halt when a step receives 55006', async () => {
    const { supabase, scenario } = createMockSupabase({
      graduationStatus: 'halted',
      previousStatus: 'minting',
    })

    ;(mintGraduationToken as any).mockRejectedValue(make55006('minted', 'minting'))

    const result = await resumeGraduation('grad-1', makeAdmin(), { supabase: supabase as any })

    expect(result).toMatchObject({
      graduation_id: 'grad-1',
      status: 'minting',
      resumed_by: 'admin:actor',
    })

    expect(scenario.graduationStatus).not.toBe('halted')
    expect(scenario.haltedReason).toBeNull()
  })
})

describe('runResumeWork (mocked client)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultSteps()
  })

  it('stops cleanly on 55006 and does not mark the graduation halted', async () => {
    const { supabase, scenario } = createMockSupabase({
      graduationStatus: 'minting',
      previousStatus: null,
    })

    ;(mintGraduationToken as any).mockRejectedValue(make55006('minted', 'minting'))

    await runResumeWork('grad-1', { supabase: supabase as any })

    expect(scenario.graduationStatus).toBe('minting')

    const haltUpdate = scenario.calls.find(
      (c) =>
        c.table === 'graduations' &&
        c.kind === 'update' &&
        c.payload?.status === 'halted'
    )
    expect(haltUpdate).toBeUndefined()

    const haltEvent = scenario.calls.find(
      (c) =>
        c.table === 'graduation_events' &&
        c.kind === 'insert' &&
        c.payload?.to_status === 'halted'
    )
    expect(haltEvent).toBeUndefined()
  })
})
