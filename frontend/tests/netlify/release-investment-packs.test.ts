import { describe, it, expect, vi } from 'vitest'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { closeStalePendingPayments } from '../../netlify/functions/release-investment-packs'

vi.mock('@/lib/scan-user-deposits', () => ({
  scanAndSweepUserDeposits: vi.fn(),
}))
import { createFixtureUser, cleanupFixtures } from '../api/startup-votes/fixtures'

const HOURS = 60 * 60 * 1000

async function createPayment(
  userId: string,
  status: 'pending' | 'paid',
  ageHours: number
) {
  const id = crypto.randomUUID()
  const createdAt = new Date(Date.now() - ageHours * HOURS).toISOString()
  const { error } = await supabaseAdmin.from('stripe_payments').insert({
    id,
    user_id: userId,
    product: 'listing_pack',
    amount_charged: 24,
    currency: 'usd',
    credits_granted: 3,
    status,
    created_at: createdAt,
    updated_at: createdAt,
  } as any)
  if (error) throw new Error(`createPayment failed: ${error.message}`)
  return id
}

async function getPayment(id: string) {
  const { data, error } = await supabaseAdmin
    .from('stripe_payments')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(`getPayment failed: ${error.message}`)
  return data
}

describe('closeStalePendingPayments', () => {
  it('fails a 49-hour-old pending payment', async () => {
    const user = await createFixtureUser()
    const paymentId = await createPayment(user.id, 'pending', 49)

    try {
      const closed = await closeStalePendingPayments(user.id)
      expect(closed).toBe(1)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('failed')
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('does not touch a 49-hour-old paid payment', async () => {
    const user = await createFixtureUser()
    const paymentId = await createPayment(user.id, 'paid', 49)

    try {
      const closed = await closeStalePendingPayments(user.id)
      expect(closed).toBe(0)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('paid')
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('does not touch another user\'s stale pending payment when scoped', async () => {
    const otherUser = await createFixtureUser()
    const otherPaymentId = await createPayment(otherUser.id, 'pending', 49)

    const user = await createFixtureUser()
    const paymentId = await createPayment(user.id, 'pending', 49)

    try {
      const closed = await closeStalePendingPayments(user.id)
      expect(closed).toBe(1)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('failed')

      const otherRow = await getPayment(otherPaymentId)
      expect(otherRow.status).toBe('pending')
    } finally {
      await cleanupFixtures(otherUser.id, [])
      await cleanupFixtures(user.id, [])
    }
  })
})
