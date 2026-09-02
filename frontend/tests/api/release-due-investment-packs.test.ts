import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'
import { createFixtureUser, cleanupFixtures } from './startup-votes/fixtures'

const USDC_DECIMALS = 6

let backedLiabilityBefore: string

function exactToFixed(value: string, decimals: number): string {
  return Decimal.parse(value).toFixed(decimals)
}

async function recordLedger() {
  const { data, error } = await supabaseAdmin
    .from('ledger_liability')
    .select('backed_liability_exact')
    .single()
  if (error) throw new Error(`recordLedger failed: ${error.message}`)
  backedLiabilityBefore = data.backed_liability_exact
}

async function currentBackedLiability() {
  const { data, error } = await supabaseAdmin
    .from('ledger_liability')
    .select('backed_liability_exact')
    .single()
  if (error) throw new Error(`currentBackedLiability failed: ${error.message}`)
  return data.backed_liability_exact as string
}

async function currentBalance(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('balances')
    .select('available_usdc')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`currentBalance failed: ${error.message}`)
  return data ? Number(data.available_usdc) : 0
}

async function currentPaymentStatus(paymentId: string) {
  const { data, error } = await supabaseAdmin
    .from('stripe_payments')
    .select('status')
    .eq('id', paymentId)
    .single()
  if (error) throw new Error(`currentPaymentStatus failed: ${error.message}`)
  return data.status
}

async function createInvestmentPayment(
  userId: string,
  usdc: number,
  releaseOffsetMs: number
) {
  const paymentId = crypto.randomUUID()
  const releaseAfter = new Date(Date.now() + releaseOffsetMs).toISOString()

  const { error } = await supabaseAdmin.from('stripe_payments').insert({
    id: paymentId,
    user_id: userId,
    product: 'investment_pack',
    amount_charged: usdc,
    currency: 'usd',
    usdc_granted: usdc,
    status: 'paid',
    release_after: releaseAfter,
  } as any)
  if (error) throw new Error(`createInvestmentPayment failed: ${error.message}`)

  const { error: balanceError } = await supabaseAdmin
    .from('balances')
    .insert({
      user_id: userId,
      available_usdc: 0,
      locked_usdc: 0,
    } as any)
  if (balanceError && balanceError.code !== '23505') {
    throw new Error(`insert balance failed: ${balanceError.message}`)
  }

  return paymentId
}

async function releaseForUser(userId: string | null) {
  const params = userId === null ? { p_user_id: null } : { p_user_id: userId }
  const { data, error } = await supabaseAdmin.rpc(
    'release_due_investment_packs',
    params
  )
  if (error) throw new Error(`release_due_investment_packs failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    count: Number(row.r_released_count ?? 0),
    usdc: Number(row.r_released_usdc ?? 0),
  }
}

describe('release_due_investment_packs', () => {
  beforeAll(async () => {
    await recordLedger()
  })

  afterAll(async () => {
    expect(await currentBackedLiability()).toBe(backedLiabilityBefore)
  })

  it('does not release a future-dated payment, leaving balance unchanged', async () => {
    const user = await createFixtureUser()
    const paymentId = await createInvestmentPayment(user.id, 25, 24 * 60 * 60 * 1000)

    try {
      const result = await releaseForUser(user.id)
      expect(result.count).toBe(0)
      expect(result.usdc).toBe(0)
      expect(await currentBalance(user.id)).toBe(0)
      expect(await currentPaymentStatus(paymentId)).toBe('paid')
      expect(await currentBackedLiability()).toBe(backedLiabilityBefore)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('releases a due payment, raises the balance, and marks the row granted', async () => {
    const user = await createFixtureUser()
    const paymentId = await createInvestmentPayment(user.id, 25, -60 * 1000)

    try {
      const result = await releaseForUser(user.id)
      expect(result.count).toBe(1)
      expect(result.usdc).toBe(25)
      expect(await currentBalance(user.id)).toBe(25)
      expect(await currentPaymentStatus(paymentId)).toBe('granted')
      const expected = Decimal.parse(backedLiabilityBefore).add(Decimal.parse('25')).toFixed(USDC_DECIMALS)
      const after = exactToFixed(await currentBackedLiability(), USDC_DECIMALS)
      expect(after).toBe(expected)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('releases only once on a second call', async () => {
    const user = await createFixtureUser()
    await createInvestmentPayment(user.id, 25, -60 * 1000)

    try {
      const first = await releaseForUser(user.id)
      expect(first.count).toBe(1)
      expect(first.usdc).toBe(25)
      expect(await currentBalance(user.id)).toBe(25)

      const second = await releaseForUser(user.id)
      expect(second.count).toBe(0)
      expect(second.usdc).toBe(0)
      expect(await currentBalance(user.id)).toBe(25)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('with a user id, does not release a different user\'s due payment', async () => {
    const user1 = await createFixtureUser()
    const payment1 = await createInvestmentPayment(user1.id, 25, -60 * 1000)
    const user2 = await createFixtureUser()
    const payment2 = await createInvestmentPayment(user2.id, 50, -60 * 1000)

    try {
      const result = await releaseForUser(user1.id)
      expect(result.count).toBe(1)
      expect(result.usdc).toBe(25)

      expect(await currentBalance(user1.id)).toBe(25)
      expect(await currentPaymentStatus(payment1)).toBe('granted')

      expect(await currentBalance(user2.id)).toBe(0)
      expect(await currentPaymentStatus(payment2)).toBe('paid')
      const expected = Decimal.parse(backedLiabilityBefore).add(Decimal.parse('25')).toFixed(USDC_DECIMALS)
      const after = exactToFixed(await currentBackedLiability(), USDC_DECIMALS)
      expect(after).toBe(expected)
    } finally {
      await cleanupFixtures(user1.id, [])
      await cleanupFixtures(user2.id, [])
    }
  })
})
