import { describe, it, expect, beforeAll } from 'vitest'
import { POST as webhook } from '@/app/api/stripe/webhook/route'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'
import Stripe from 'stripe'

const WEBHOOK_SECRET = 'whsec_test_webhook_secret'
const STRIPE_API_KEY = 'sk_test_dummy'

function post(payload: string, signature: string) {
  return webhook(
    new Request('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': signature,
        'Content-Type': 'application/json',
      },
      body: payload,
    })
  )
}

function sign(payload: string) {
  const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2026-07-29.dahlia' })
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  })
}

function makeCheckoutCompletedEvent(
  paymentId: string,
  amountTotal: number,
  eventId: string
) {
  const event = {
    id: eventId,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_test' },
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_session',
        object: 'checkout.session',
        amount_total: amountTotal,
        currency: 'usd',
        metadata: { payment_id: paymentId },
        payment_status: 'paid',
        status: 'complete',
      },
    },
  }
  const payload = JSON.stringify(event)
  return { payload, signature: sign(payload) }
}

function makeDisputeEvent() {
  const event = {
    id: 'evt_dispute_test',
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_test' },
    type: 'charge.dispute.created',
    data: {
      object: {
        id: 'dp_test',
        object: 'dispute',
        charge: 'ch_test',
        status: 'needs_response',
      },
    },
  }
  const payload = JSON.stringify(event)
  return { payload, signature: sign(payload) }
}

function makeUnknownEvent() {
  const event = {
    id: 'evt_unknown_test',
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_test' },
    type: 'invoice.payment_succeeded',
    data: {
      object: { id: 'in_test', object: 'invoice' },
    },
  }
  const payload = JSON.stringify(event)
  return { payload, signature: sign(payload) }
}

async function createListingPayment(userId: string) {
  const id = crypto.randomUUID()
  const { error } = await supabaseAdmin.from('stripe_payments').insert({
    id,
    user_id: userId,
    product: 'listing_pack',
    amount_charged: 2400,
    currency: 'usd',
    credits_granted: 3,
    status: 'pending',
  } as any)
  if (error) throw new Error(`insert listing payment failed: ${error.message}`)
  return id
}

async function createInvestmentPayment(userId: string) {
  const id = crypto.randomUUID()
  const releaseAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin.from('stripe_payments').insert({
    id,
    user_id: userId,
    product: 'investment_pack',
    amount_charged: 2500,
    currency: 'usd',
    usdc_granted: 25,
    status: 'pending',
    release_after: releaseAfter,
  } as any)
  if (error) throw new Error(`insert investment payment failed: ${error.message}`)
  return id
}

async function getPayment(paymentId: string) {
  const { data, error } = await supabaseAdmin
    .from('stripe_payments')
    .select('*')
    .eq('id', paymentId)
    .single()
  if (error) throw new Error(`get payment failed: ${error.message}`)
  return data
}

async function currentCredits(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_listing_credits')
    .select('credits')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`currentCredits failed: ${error.message}`)
  return data?.credits ?? 0
}

async function creditEventCount(userId: string) {
  const { count, error } = await supabaseAdmin
    .from('listing_credit_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw new Error(`creditEventCount failed: ${error.message}`)
  return count ?? 0
}

async function balanceExists(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('balances')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`balanceExists failed: ${error.message}`)
  return data !== null
}

describe('POST /api/stripe/webhook', () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_API_KEY
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  })

  it('returns 400 and does nothing on an invalid signature', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)

    try {
      const { payload } = makeCheckoutCompletedEvent(paymentId, 2400, 'evt_invalid_test')
      const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2026-07-29.dahlia' })
      const badSignature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_wrong_secret',
        timestamp: Math.floor(Date.now() / 1000),
      })

      const res = await post(payload, badSignature)
      expect(res.status).toBe(400)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('pending')
      expect(await currentCredits(user.id)).toBe(0)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('grants exactly the stored credits for a listing pack and marks it granted', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)
    const eventId = 'evt_listing_test_1'

    try {
      const { payload, signature } = makeCheckoutCompletedEvent(paymentId, 2400, eventId)
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('granted')
      expect(row.stripe_event_id).toBe(eventId)

      expect(await currentCredits(user.id)).toBe(3)
      expect(await creditEventCount(user.id)).toBe(1)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('replaying the same event returns 200 and grants nothing further', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)
    const eventId = 'evt_listing_replay_test'

    try {
      const { payload, signature } = makeCheckoutCompletedEvent(paymentId, 2400, eventId)
      await post(payload, signature)
      expect(await currentCredits(user.id)).toBe(3)

      const res2 = await post(payload, signature)
      expect(res2.status).toBe(200)

      expect(await currentCredits(user.id)).toBe(3)
      expect(await creditEventCount(user.id)).toBe(1)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('marks an investment pack as paid and does not touch the balance', async () => {
    const user = await createFixtureUser()
    const paymentId = await createInvestmentPayment(user.id)
    const eventId = 'evt_investment_test_1'

    try {
      const { payload, signature } = makeCheckoutCompletedEvent(paymentId, 2500, eventId)
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('paid')
      expect(row.stripe_event_id).toBe(eventId)

      expect(await currentCredits(user.id)).toBe(0)
      expect(await creditEventCount(user.id)).toBe(0)
      expect(await balanceExists(user.id)).toBe(false)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('returns 200 for an unrecognised event and does not touch the payment row', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)

    try {
      const { payload, signature } = makeUnknownEvent()
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('pending')
      expect(await currentCredits(user.id)).toBe(0)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('grants the stored amount, not a different amount in the payload', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)
    const eventId = 'evt_amount_mismatch_test'

    try {
      const { payload, signature } = makeCheckoutCompletedEvent(paymentId, 1000, eventId)
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      expect(await currentCredits(user.id)).toBe(3)
      const row = await getPayment(paymentId)
      expect(row.status).toBe('granted')
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('records a dispute event without crashing', async () => {
    const { payload, signature } = makeDisputeEvent()
    const res = await post(payload, signature)
    expect(res.status).toBe(200)
  })
})
