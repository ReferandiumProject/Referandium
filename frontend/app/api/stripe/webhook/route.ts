import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Money } from '@/lib/money'
import { errorResponse } from '@/lib/errorResponse'
import Stripe from 'stripe'

const CHECKOUT_SUCCESS_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
])

async function linkDisputesToPayment(
  chargeId: string,
  paymentId: string,
  paymentIntentId: string
) {
  try {
    const { error } = await supabaseAdmin
      .from('stripe_disputes')
      .update({ payment_id: paymentId, stripe_payment_intent_id: paymentIntentId })
      .eq('stripe_charge_id', chargeId)
      .is('payment_id', null)

    if (error) {
      console.error('[api/stripe/webhook] failed to back-link disputes:', error)
    }
  } catch (err: any) {
    console.error('[api/stripe/webhook] unexpected error back-linking disputes:', err?.message ?? err)
  }
}

export async function POST(request: Request) {
  const payload = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const apiKey = process.env.STRIPE_SECRET_KEY

  if (!secret || !apiKey) {
    return errorResponse({
      status: 500,
      message: 'Webhook configuration error',
      error: 'Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY',
      request,
      kind: 'text',
    })
  }

  const stripe = new Stripe(apiKey, { apiVersion: '2026-07-29.dahlia' })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, sig, secret)
  } catch (err: any) {
    console.error('[api/stripe/webhook] signature verification failed:', err.message)
    return new NextResponse('Invalid signature', { status: 400 })
  }

  if (
    !CHECKOUT_SUCCESS_EVENTS.has(event.type) &&
    event.type !== 'checkout.session.async_payment_failed' &&
    event.type !== 'checkout.session.expired' &&
    event.type !== 'charge.dispute.created'
  ) {
    return new NextResponse(null, { status: 200 })
  }

  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute
    const disputeChargeId = (dispute as any).charge
    const disputeAmount = dispute.amount

    if (typeof disputeChargeId !== 'string' || typeof disputeAmount !== 'number') {
      return errorResponse({
        status: 500,
        message: 'Dispute details incomplete',
        error: 'Dispute missing charge or amount',
        request,
        kind: 'text',
      })
    }

    const { data: payment } = await supabaseAdmin
      .from('stripe_payments')
      .select('id, stripe_payment_intent_id')
      .eq('stripe_charge_id', disputeChargeId)
      .maybeSingle()

    const disputeRow: Record<string, any> = {
      stripe_dispute_id: dispute.id,
      stripe_charge_id: disputeChargeId,
      amount: Money.fromCents(disputeAmount).toDollars(),
      currency: (dispute.currency || 'usd').toLowerCase(),
      reason: dispute.reason ?? null,
      status: dispute.status ?? null,
      stripe_created_at: new Date(dispute.created * 1000).toISOString(),
      raw: event,
    }

    if (payment) {
      disputeRow.payment_id = payment.id
      disputeRow.stripe_payment_intent_id = payment.stripe_payment_intent_id
    }

    const { error: insertError } = await supabaseAdmin.from('stripe_disputes').insert(disputeRow)

    if (insertError) {
      if (insertError.message?.includes('unique')) {
        return new NextResponse(null, { status: 200 })
      }
      return errorResponse({
        status: 500,
        message: 'Dispute insert failed',
        error: insertError,
        request,
        kind: 'text',
      })
    }

    console.log('[api/stripe/webhook] dispute recorded:', dispute.id, 'for charge:', disputeChargeId)
    return new NextResponse(null, { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const paymentId = session.metadata?.payment_id

  if (!paymentId) {
    console.error('[api/stripe/webhook] missing payment_id in session metadata')
    return new NextResponse(null, { status: 200 })
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from('stripe_payments')
    .select('*')
    .eq('id', paymentId)
    .single()

  if (rowError || !row) {
    console.error('[api/stripe/webhook] payment row not found for id:', paymentId)
    return new NextResponse(null, { status: 200 })
  }

  if (row.stripe_event_id === event.id) {
    return new NextResponse(null, { status: 200 })
  }

  const now = new Date().toISOString()

  if (event.type === 'checkout.session.async_payment_failed') {
    await supabaseAdmin
      .from('stripe_payments')
      .update({ status: 'failed', stripe_event_id: event.id, updated_at: now })
      .eq('id', paymentId)
    return new NextResponse(null, { status: 200 })
  }

  if (event.type === 'checkout.session.expired') {
    const { error: updateError } = await supabaseAdmin
      .from('stripe_payments')
      .update({ status: 'failed', stripe_event_id: event.id, updated_at: now })
      .eq('id', paymentId)
      .eq('status', 'pending')

    if (updateError) {
      if (updateError.message?.includes('unique')) {
        return new NextResponse(null, { status: 200 })
      }
      console.error('[api/stripe/webhook] failed to update expired payment:', updateError)
      return errorResponse({
        status: 500,
        message: 'Update failed',
        error: updateError,
        request,
        kind: 'text',
      })
    }

    return new NextResponse(null, { status: 200 })
  }

  if (row.status !== 'pending') {
    return new NextResponse(null, { status: 200 })
  }

  let expandedSession: Stripe.Checkout.Session
  try {
    expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['payment_intent.latest_charge'],
    })
  } catch (err: any) {
    return errorResponse({
      status: 500,
      message: 'Failed to retrieve payment details',
      error: err,
      request,
      kind: 'text',
    })
  }

  const paymentIntent = expandedSession.payment_intent
  if (typeof paymentIntent !== 'object' || !paymentIntent) {
    return errorResponse({
      status: 500,
      message: 'Payment details incomplete',
      error: 'payment_intent not expanded',
      request,
      kind: 'text',
    })
  }

  const rawCharge = paymentIntent.latest_charge
  const chargeId =
    typeof rawCharge === 'string'
      ? rawCharge
      : typeof rawCharge === 'object' && rawCharge
        ? rawCharge.id
        : null
  if (!chargeId) {
    return errorResponse({
      status: 500,
      message: 'Payment details incomplete',
      error: 'charge id not available',
      request,
      kind: 'text',
    })
  }
  const paymentIntentId = paymentIntent.id

  if (row.product === 'listing_pack') {
    try {
      const { error: grantError } = await supabaseAdmin.rpc('grant_listing_credits', {
        p_user_id: row.user_id,
        p_credits: row.credits_granted,
        p_payment_id: row.id,
        p_reason: 'purchase',
      })

      if (grantError) {
        return errorResponse({
          status: 500,
          message: 'Grant failed',
          error: grantError,
          request,
          kind: 'text',
        })
      }
    } catch (err: any) {
      return errorResponse({
        status: 500,
        message: 'Grant failed',
        error: err,
        request,
        kind: 'text',
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('stripe_payments')
      .update({
        status: 'granted',
        stripe_event_id: event.id,
        updated_at: now,
        stripe_charge_id: chargeId,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq('id', paymentId)

    if (updateError) {
      if (updateError.message?.includes('unique')) {
        return new NextResponse(null, { status: 200 })
      }
      return errorResponse({
        status: 500,
        message: 'Update failed',
        error: updateError,
        request,
        kind: 'text',
      })
    }

    await linkDisputesToPayment(chargeId, paymentId, paymentIntentId)

    return new NextResponse(null, { status: 200 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('stripe_payments')
    .update({
      status: 'paid',
      stripe_event_id: event.id,
      updated_at: now,
      stripe_charge_id: chargeId,
      stripe_payment_intent_id: paymentIntentId,
      usdc_granted: null,
      release_after: null,
      funds_available_on: null,
    })
    .eq('id', paymentId)

  if (updateError) {
    if (updateError.message?.includes('unique')) {
      return new NextResponse(null, { status: 200 })
    }
    return errorResponse({
      status: 500,
      message: 'Update failed',
      error: updateError,
      request,
      kind: 'text',
    })
  }

  await linkDisputesToPayment(chargeId, paymentId, paymentIntentId)

  return new NextResponse(null, { status: 200 })
}
