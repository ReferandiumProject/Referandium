import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { POST as faucet } from '@/app/api/deposit/devnet/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const originalFaucetEnabled = process.env.DEVNET_FAUCET_ENABLED
const originalDailyCap = process.env.DEVNET_FAUCET_DAILY_CAP_USDC

async function cleanupFaucet(userId: string) {
  await supabaseAdmin.from('ledger_adjustments').delete().eq('user_id', userId)
  await supabaseAdmin.from('balances').delete().eq('user_id', userId)
  await supabaseAdmin.from('users').delete().eq('id', userId)
}

function makeRequest(amount: string, headers?: Record<string, string>) {
  return new Request('http://localhost:3000/api/deposit/devnet', {
    method: 'POST',
    headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ amount_usdc: amount }),
  })
}

describe('POST /api/deposit/devnet', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.DEVNET_FAUCET_ENABLED
    delete process.env.DEVNET_FAUCET_DAILY_CAP_USDC
  })

  afterAll(() => {
    process.env.DEVNET_FAUCET_ENABLED = originalFaucetEnabled
    process.env.DEVNET_FAUCET_DAILY_CAP_USDC = originalDailyCap
  })

  it('refuses when the faucet is not enabled', async () => {
    const user = await createFixtureUser()
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    try {
      const res = await faucet(makeRequest('100'))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toMatch(/not enabled/i)
    } finally {
      await cleanupFaucet(user.id)
    }
  })

  it('credits balance and writes a matching ledger adjustment', async () => {
    const user = await createFixtureUser()
    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '0',
      locked_usdc: '0',
    })

    process.env.DEVNET_FAUCET_ENABLED = 'true'
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    try {
      const res = await faucet(makeRequest('123.45'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.new_balance).toBe(123.45)

      const { data: balance } = await supabaseAdmin
        .from('balances')
        .select('available_usdc')
        .eq('user_id', user.id)
        .single()
      expect(Number(balance!.available_usdc)).toBe(123.45)

      const { data: adjustment } = await supabaseAdmin
        .from('ledger_adjustments')
        .select('amount, reason')
        .eq('user_id', user.id)
        .eq('reason', 'faucet')
        .single()
      expect(adjustment).not.toBeNull()
      expect(Number(adjustment!.amount)).toBe(123.45)
      expect(adjustment!.reason).toBe('faucet')
    } finally {
      await cleanupFaucet(user.id)
    }
  })

  it('does not change backed_liability after a faucet credit', async () => {
    const user = await createFixtureUser()
    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '0',
      locked_usdc: '0',
    })

    const { data: before } = await supabaseAdmin
      .from('ledger_liability')
      .select('backed_liability')
      .single()

    process.env.DEVNET_FAUCET_ENABLED = 'true'
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    try {
      const res = await faucet(makeRequest('100'))
      expect(res.status).toBe(200)

      const { data: after } = await supabaseAdmin
        .from('ledger_liability')
        .select('backed_liability')
        .single()

      expect(Number(after?.backed_liability)).toBe(Number(before?.backed_liability))
    } finally {
      await cleanupFaucet(user.id)
    }
  })

  it('rejects a request above the per-request cap with no balance or ledger change', async () => {
    const user = await createFixtureUser()
    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '10',
      locked_usdc: '0',
    })

    process.env.DEVNET_FAUCET_ENABLED = 'true'
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    try {
      const res = await faucet(makeRequest('10000'))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/per-request cap/i)

      const { data: balance } = await supabaseAdmin
        .from('balances')
        .select('available_usdc')
        .eq('user_id', user.id)
        .single()
      expect(Number(balance!.available_usdc)).toBe(10)

      const { data: adjustments } = await supabaseAdmin
        .from('ledger_adjustments')
        .select('id')
        .eq('user_id', user.id)
        .eq('reason', 'faucet')
      expect(adjustments).toHaveLength(0)
    } finally {
      await cleanupFaucet(user.id)
    }
  })
})
