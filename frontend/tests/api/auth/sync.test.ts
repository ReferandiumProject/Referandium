import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { POST as syncAuth } from '@/app/api/auth/sync/route'
import { privyClient } from '@/lib/privy-server'
import { supabaseAdmin } from '@/lib/supabaseServer'

vi.mock('@/lib/privy-server', () => ({
  privyClient: {
    verifyAuthToken: vi.fn(),
    getUser: vi.fn(),
  },
}))

const originalSignupBonus = process.env.SIGNUP_BONUS_USDC

async function cleanupByPrivyId(privyId: string) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('privy_id', privyId)
    .maybeSingle()
  if (user) {
    await supabaseAdmin.from('ledger_adjustments').delete().eq('user_id', user.id)
    await supabaseAdmin.from('balances').delete().eq('user_id', user.id)
    await supabaseAdmin.from('users').delete().eq('id', user.id)
  }
}

function makePrivyUser(privyId: string, email: string, wallet: string) {
  return {
    linkedAccounts: [
      { type: 'google_oauth', email },
      { type: 'wallet', chain: 'solana', address: wallet },
    ],
  }
}

function makeSyncRequest(): NextRequest {
  return new Request('http://localhost:3000/api/auth/sync', {
    method: 'POST',
    headers: { Authorization: 'Bearer mock-token' },
  }) as unknown as NextRequest
}

describe('/api/auth/sync signup bonus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.SIGNUP_BONUS_USDC
  })

  afterAll(() => {
    process.env.SIGNUP_BONUS_USDC = originalSignupBonus
  })

  it('creates a zero balance when SIGNUP_BONUS_USDC is unset', async () => {
    const privyId = `did:privy:auth-sync-no-bonus-${crypto.randomUUID()}`
    const email = `auth-sync-no-bonus-${crypto.randomUUID()}@example.com`
    const wallet = `0xAuthSyncNoBonus${crypto.randomUUID().slice(0, 8)}`
    await cleanupByPrivyId(privyId)

    vi.mocked(privyClient.verifyAuthToken).mockResolvedValue({ userId: privyId } as any)
    vi.mocked(privyClient.getUser).mockResolvedValue(makePrivyUser(privyId, email, wallet) as any)

    const res = await syncAuth(makeSyncRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.available_usdc).toBe(0)

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('privy_id', privyId)
      .single()
    expect(user).not.toBeNull()
    const { data: balance } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', user!.id)
      .single()
    expect(Number(balance!.available_usdc)).toBe(0)

    await cleanupByPrivyId(privyId)
  })

  it('credits the configured signup bonus on first sync', async () => {
    const privyId = `did:privy:auth-sync-with-bonus-${crypto.randomUUID()}`
    const email = `auth-sync-with-bonus-${crypto.randomUUID()}@example.com`
    const wallet = `0xAuthSyncWithBonus${crypto.randomUUID().slice(0, 8)}`
    await cleanupByPrivyId(privyId)

    process.env.SIGNUP_BONUS_USDC = '1234.56'

    vi.mocked(privyClient.verifyAuthToken).mockResolvedValue({ userId: privyId } as any)
    vi.mocked(privyClient.getUser).mockResolvedValue(makePrivyUser(privyId, email, wallet) as any)

    const res = await syncAuth(makeSyncRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.available_usdc).toBe(1234.56)

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('privy_id', privyId)
      .single()
    expect(user).not.toBeNull()
    const { data: balance } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', user!.id)
      .single()
    expect(Number(balance!.available_usdc)).toBe(1234.56)

    const { data: adjustment } = await supabaseAdmin
      .from('ledger_adjustments')
      .select('amount, reason')
      .eq('user_id', user!.id)
      .eq('reason', 'signup_bonus')
      .single()
    expect(adjustment).not.toBeNull()
    expect(Number(adjustment!.amount)).toBe(1234.56)
    expect(adjustment!.reason).toBe('signup_bonus')

    await cleanupByPrivyId(privyId)
  })

  it('does not credit the signup bonus again on a second sync', async () => {
    const privyId = `did:privy:auth-sync-duplicate-${crypto.randomUUID()}`
    const email = `auth-sync-duplicate-${crypto.randomUUID()}@example.com`
    const wallet = `0xAuthSyncDuplicate${crypto.randomUUID().slice(0, 8)}`
    await cleanupByPrivyId(privyId)

    process.env.SIGNUP_BONUS_USDC = '500'

    vi.mocked(privyClient.verifyAuthToken).mockResolvedValue({ userId: privyId } as any)
    vi.mocked(privyClient.getUser).mockResolvedValue(makePrivyUser(privyId, email, wallet) as any)

    const firstRes = await syncAuth(makeSyncRequest())
    expect(firstRes.status).toBe(200)
    const firstJson = await firstRes.json()
    expect(firstJson.available_usdc).toBe(500)

    const secondRes = await syncAuth(makeSyncRequest())
    expect(secondRes.status).toBe(200)
    const secondJson = await secondRes.json()
    expect(secondJson.available_usdc).toBe(500)

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('privy_id', privyId)
      .single()
    expect(user).not.toBeNull()
    const { data: balance } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', user!.id)
      .single()
    expect(Number(balance!.available_usdc)).toBe(500)

    await cleanupByPrivyId(privyId)
  })
})
