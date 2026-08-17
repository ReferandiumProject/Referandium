import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { POST as webhook } from '@/app/api/stripe/webhook/route'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { backfillInvestmentPacks } from '@/lib/backfill-investment-packs'
import { Money } from '@/lib/money'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'
import Stripe from 'stripe'

const WEBHOOK_SECRET = 'whsec_test_webhook_secret'
const STRIPE_API_KEY = 'sk_test_dummy'

const mockRetrieve = vi.hoisted(() => vi.fn())
const mockChargeRetrieve = vi.hoisted(() => vi.fn())

vi.mock('stripe', () => ({
  default: class Stripe {
    constructor(_apiKey: string, _opts?: any) {}
    get webhooks() {
      const signPayload = (payload: string, secret: string, timestamp: number) => {
        const base = `${timestamp}.${payload}.${secret}`
        return Buffer.from(base).toString('hex')
      }
      return {
        generateTestHeaderString({ payload, secret, timestamp }: any) {
          const v1 = signPayload(payload, secret, timestamp)
          return `t=${timestamp},v1=${v1}`
        },
        constructEvent(payload: string, sig: string, secret: string) {
          const parts: Record<string, string> = {}
          for (const part of sig.split(',')) {
            const [key, ...rest] = part.split('=')
            parts[key] = rest.join('=')
          }
          const expected = signPayload(payload, secret, parseInt(parts.t, 10))
          if (parts.v1 !== expected) {
            throw new Error('Invalid signature')
          }
          return JSON.parse(payload)
        },
      }
    }
    get checkout() {
      return {
        sessions: {
          retrieve: mockRetrieve,
        },
      }
    }
    get charges() {
      return {
        retrieve: mockChargeRetrieve,
      }
    }
  },
}))

beforeEach(() => {
  mockRetrieve.mockReset()
  mockChargeRetrieve.mockReset()
})

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

function makeExpandedSession(
  sessionId: string,
  amountTotal: number,
  fee: number,
  availableOn: number,
  balanceAmount = amountTotal,
  exchangeRate: number | null = null,
  settlementCurrency = 'usd',
  sessionCurrency = 'usd',
  balanceTransactionId: string | null = null
) {
  const balanceTransaction = balanceTransactionId
    ? balanceTransactionId
    : {
        id: 'txn_test',
        object: 'balance_transaction',
        amount: balanceAmount,
        currency: settlementCurrency,
        fee,
        exchange_rate: exchangeRate,
        available_on: availableOn,
      }
  return {
    id: sessionId,
    object: 'checkout.session',
    amount_total: amountTotal,
    currency: sessionCurrency,
    payment_intent: {
      id: 'pi_test',
      object: 'payment_intent',
      latest_charge: {
        id: 'ch_test',
        object: 'charge',
        currency: sessionCurrency,
        balance_transaction: balanceTransaction,
      },
    },
  }
}

function makeCharge(
  fee: number,
  availableOn: number,
  balanceAmount = 1000,
  exchangeRate: number | null = null,
  settlementCurrency = 'usd',
  sessionCurrency = 'usd'
) {
  return {
    id: 'ch_test',
    object: 'charge',
    currency: sessionCurrency,
    balance_transaction: {
      id: 'txn_test',
      object: 'balance_transaction',
      amount: balanceAmount,
      currency: settlementCurrency,
      fee,
      exchange_rate: exchangeRate,
      available_on: availableOn,
    },
  }
}

function makeCheckoutCompletedEvent(
  paymentId: string,
  amountTotal: number,
  eventId: string,
  fee = 0,
  availableOn = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60,
  balanceAmount = amountTotal,
  exchangeRate: number | null = null,
  settlementCurrency = 'usd',
  sessionCurrency = 'usd',
  balanceTransactionId: string | null = null
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
        currency: sessionCurrency,
        metadata: { payment_id: paymentId },
        payment_status: 'paid',
        status: 'complete',
      },
    },
  }
  mockRetrieve.mockResolvedValueOnce(
    makeExpandedSession(
      'cs_test_session',
      amountTotal,
      fee,
      availableOn,
      balanceAmount,
      exchangeRate,
      settlementCurrency,
      sessionCurrency,
      balanceTransactionId
    )
  )
  const payload = JSON.stringify(event)
  return { payload, signature: sign(payload) }
}

function makeDisputeEvent(
  chargeId = 'ch_test',
  amount = 2400,
  disputeId = 'dp_test',
  reason = 'fraudulent'
) {
  const event = {
    id: `evt_${disputeId}`,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_test' },
    type: 'charge.dispute.created',
    data: {
      object: {
        id: disputeId,
        object: 'dispute',
        charge: chargeId,
        amount,
        currency: 'usd',
        reason,
        status: 'needs_response',
        created: Math.floor(Date.now() / 1000),
      },
    },
  }
  const payload = JSON.stringify(event)
  return { payload, signature: sign(payload) }
}

function makeCheckoutExpiredEvent(paymentId: string, eventId: string) {
  const event = {
    id: eventId,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_test' },
    type: 'checkout.session.expired',
    data: {
      object: {
        id: 'cs_test_expired',
        object: 'checkout.session',
        amount_total: 2500,
        currency: 'usd',
        metadata: { payment_id: paymentId },
        payment_status: 'unpaid',
        status: 'expired',
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
    amount_charged: Money.fromCents(2400).toDollars(),
    currency: 'usd',
    credits_granted: 3,
    status: 'pending',
  } as any)
  if (error) throw new Error(`insert listing payment failed: ${error.message}`)
  return id
}

async function createInvestmentPayment(userId: string, amountCharged = 25, usdc = amountCharged) {
  const id = crypto.randomUUID()
  const releaseAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin.from('stripe_payments').insert({
    id,
    user_id: userId,
    product: 'investment_pack',
    amount_charged: amountCharged,
    currency: 'usd',
    usdc_granted: usdc,
    status: 'pending',
    release_after: releaseAfter,
  } as any)
  if (error) throw new Error(`insert investment payment failed: ${error.message}`)
  return id
}

async function createPaidInvestmentPayment(
  userId: string,
  amountCharged = 25,
  chargeId = 'ch_test'
) {
  const id = crypto.randomUUID()
  const releaseAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin.from('stripe_payments').insert({
    id,
    user_id: userId,
    product: 'investment_pack',
    amount_charged: amountCharged,
    currency: 'usd',
    usdc_granted: null,
    status: 'paid',
    stripe_charge_id: chargeId,
    release_after: releaseAfter,
  } as any)
  if (error) throw new Error(`insert paid investment payment failed: ${error.message}`)
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

async function getDispute(disputeId: string) {
  const { data, error } = await supabaseAdmin
    .from('stripe_disputes')
    .select('*')
    .eq('stripe_dispute_id', disputeId)
    .maybeSingle()
  if (error) throw new Error(`get dispute failed: ${error.message}`)
  return data
}

async function removeDispute(disputeId: string) {
  await supabaseAdmin.from('stripe_disputes').delete().eq('stripe_dispute_id', disputeId)
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

  beforeEach(() => {
    mockRetrieve.mockReset()
    const defaultAvailableOn = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60
    mockRetrieve.mockResolvedValue(
      makeExpandedSession('cs_test_session', 2500, 0, defaultAvailableOn)
    )
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
      expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(row.created_at).getTime())

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

  it('records an investment pack as paid when the balance transaction is not yet available', async () => {
    const user = await createFixtureUser()
    const paymentId = await createInvestmentPayment(user.id)
    const eventId = 'evt_investment_pending_balance'
    const availableOn = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60

    try {
      const { payload, signature } = makeCheckoutCompletedEvent(
        paymentId,
        2500,
        eventId,
        103,
        availableOn,
        2500,
        null,
        'usd',
        'usd',
        'txn_not_yet'
      )
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('paid')
      expect(row.stripe_event_id).toBe(eventId)
      expect(row.stripe_charge_id).toBe('ch_test')
      expect(row.stripe_payment_intent_id).toBe('pi_test')
      expect(row.usdc_granted).toBeNull()
      expect(row.stripe_fee).toBeNull()
      expect(row.settlement_gross).toBeNull()
      expect(row.settlement_net).toBeNull()
      expect(row.funds_available_on).toBeNull()

      expect(await currentCredits(user.id)).toBe(0)
      expect(await creditEventCount(user.id)).toBe(0)
      expect(await balanceExists(user.id)).toBe(false)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('backfill fills the six investment columns from a EUR balance transaction', async () => {
    const user = await createFixtureUser()
    const paymentId = await createPaidInvestmentPayment(user.id, 10, 'ch_eur')
    const availableOn = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60

    try {
      mockChargeRetrieve.mockResolvedValueOnce(
        makeCharge(69, availableOn, 864, null, 'eur', 'usd')
      )

      const result = await backfillInvestmentPacks(user.id)
      expect(result.filled).toBe(1)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('paid')
      expect(Number(row.usdc_granted)).toBeCloseTo(9.20, 2)
      expect(Number(row.usdc_granted)).not.toBe(9.31)
      expect(row.settlement_currency).toBe('eur')
      expect(Number(row.settlement_gross)).toBe(8.64)
      expect(Number(row.settlement_net)).toBe(7.95)
      expect(new Date(row.release_after).getTime()).toBe(availableOn * 1000)
      expect(new Date(row.funds_available_on).getTime()).toBe(availableOn * 1000)
      expect(Number(row.stripe_exchange_rate)).toBeCloseTo(0.864, 5)
      expect(Number(row.stripe_fee)).toBe(0.69)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('backfill fills a $10 USD pack with rate 1 and usdc_granted 9.38', async () => {
    const user = await createFixtureUser()
    const paymentId = await createPaidInvestmentPayment(user.id, 10, 'ch_usd')
    const availableOn = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60

    try {
      mockChargeRetrieve.mockResolvedValueOnce(
        makeCharge(62, availableOn, 1000, null, 'usd', 'usd')
      )

      const result = await backfillInvestmentPacks(user.id)
      expect(result.filled).toBe(1)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('paid')
      expect(Number(row.usdc_granted)).toBe(9.38)
      expect(row.settlement_currency).toBe('usd')
      expect(Number(row.settlement_gross)).toBe(10)
      expect(Number(row.settlement_gross)).not.toBe(1000)
      expect(Number(row.settlement_net)).toBe(9.38)
      expect(Number(row.settlement_net)).not.toBe(938)
      expect(new Date(row.release_after).getTime()).toBe(availableOn * 1000)
      expect(new Date(row.funds_available_on).getTime()).toBe(availableOn * 1000)
      expect(Number(row.stripe_exchange_rate)).toBe(1)
      expect(Number(row.stripe_fee)).toBe(0.62)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('backfill rejects an implausible result and leaves usdc_granted null', async () => {
    const user = await createFixtureUser()
    const paymentId = await createPaidInvestmentPayment(user.id, 10, 'ch_bad')
    const availableOn = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60

    try {
      mockChargeRetrieve.mockResolvedValueOnce(
        makeCharge(62, availableOn, 100, null, 'usd', 'usd')
      )

      const result = await backfillInvestmentPacks(user.id)
      expect(result.filled).toBe(0)
      expect(result.skipped).toBe(1)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('paid')
      expect(row.usdc_granted).toBeNull()
      expect(row.settlement_gross).toBeNull()
      expect(row.settlement_net).toBeNull()
      expect(row.settlement_currency).toBeNull()
      expect(row.stripe_fee).toBeNull()
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
    const disputeId = 'dp_test'
    try {
      const { payload, signature } = makeDisputeEvent()
      const res = await post(payload, signature)
      expect(res.status).toBe(200)
    } finally {
      await removeDispute(disputeId)
    }
  })

  it('moves a pending row to failed on checkout.session.expired', async () => {
    const user = await createFixtureUser()
    const paymentId = await createInvestmentPayment(user.id)
    const eventId = 'evt_expired_test_1'

    try {
      const { payload, signature } = makeCheckoutExpiredEvent(paymentId, eventId)
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getPayment(paymentId)
      expect(row.status).toBe('failed')
      expect(row.stripe_event_id).toBe(eventId)
      expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(row.created_at).getTime())
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('does not fail a granted row on checkout.session.expired', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)
    const grantEventId = 'evt_expired_grant_first'
    const expiredEventId = 'evt_expired_granted_test'

    try {
      const { payload: grantPayload, signature: grantSignature } = makeCheckoutCompletedEvent(
        paymentId,
        2400,
        grantEventId
      )
      const grantRes = await post(grantPayload, grantSignature)
      expect(grantRes.status).toBe(200)

      const rowAfterGrant = await getPayment(paymentId)
      expect(rowAfterGrant.status).toBe('granted')
      expect(rowAfterGrant.stripe_event_id).toBe(grantEventId)

      const { payload: expiredPayload, signature: expiredSignature } = makeCheckoutExpiredEvent(
        paymentId,
        expiredEventId
      )
      const expiredRes = await post(expiredPayload, expiredSignature)
      expect(expiredRes.status).toBe(200)

      const rowAfterExpiry = await getPayment(paymentId)
      expect(rowAfterExpiry.status).toBe('granted')
      expect(rowAfterExpiry.stripe_event_id).toBe(grantEventId)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })

  it('records a dispute for a known charge and links it to the right payment', async () => {
    const user = await createFixtureUser()
    const paymentId = await createListingPayment(user.id)
    const completedEventId = 'evt_dispute_completed_test'
    const disputeId = 'dp_known_test'

    try {
      const { payload: completedPayload, signature: completedSignature } = makeCheckoutCompletedEvent(
        paymentId,
        2400,
        completedEventId
      )
      const completedRes = await post(completedPayload, completedSignature)
      expect(completedRes.status).toBe(200)

      const { payload, signature } = makeDisputeEvent('ch_test', 2400, disputeId)
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getDispute(disputeId)
      expect(row).not.toBeNull()
      expect(row!.payment_id).toBe(paymentId)
      expect(row!.stripe_charge_id).toBe('ch_test')
      expect(row!.stripe_payment_intent_id).toBe('pi_test')
      expect(Number(row!.amount)).toBe(24)
      expect(row!.currency).toBe('usd')
      expect(row!.reason).toBe('fraudulent')
      expect(row!.status).toBe('needs_response')
      expect(row!.raw).toBeDefined()
    } finally {
      await removeDispute(disputeId)
      await cleanupFixtures(user.id, [])
    }
  })

  it('records a dispute for an unknown charge with a null payment_id', async () => {
    const disputeId = 'dp_unknown_test'

    try {
      const { payload, signature } = makeDisputeEvent('ch_unknown', 1250, disputeId, 'duplicate')
      const res = await post(payload, signature)
      expect(res.status).toBe(200)

      const row = await getDispute(disputeId)
      expect(row).not.toBeNull()
      expect(row!.payment_id).toBeNull()
      expect(row!.stripe_charge_id).toBe('ch_unknown')
      expect(row!.stripe_payment_intent_id).toBeNull()
      expect(Number(row!.amount)).toBe(12.5)
      expect(row!.currency).toBe('usd')
      expect(row!.reason).toBe('duplicate')
      expect(row!.status).toBe('needs_response')
    } finally {
      await removeDispute(disputeId)
    }
  })

  afterAll(async () => {
    await supabaseAdmin
      .from('stripe_disputes')
      .delete()
      .in('stripe_dispute_id', ['dp_test', 'dp_known_test', 'dp_unknown_test'])
  })
})
