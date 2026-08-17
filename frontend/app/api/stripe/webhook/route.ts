import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Stripe from 'stripe'

const CHECKOUT_SUCCESS_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
])

export async function POST(request: Request) {
  const payload = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const apiKey = process.env.STRIPE_SECRET_KEY

  if (!secret || !apiKey) {
    console.error('[api/stripe/webhook] missing Stripe configuration')
    return new NextResponse('Webhook configuration error', { status: 500 })
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
      console.error('[api/stripe/webhook] dispute missing charge or amount')
      return new NextResponse('Dispute details incomplete', { status: 500 })
    }

    const { data: payment } = await supabaseAdmin
      .from('stripe_payments')
      .select('id, stripe_payment_intent_id')
      .eq('stripe_charge_id', disputeChargeId)
      .maybeSingle()

    const disputeRow: Record<string, any> = {
      stripe_dispute_id: dispute.id,
      stripe_charge_id: disputeChargeId,
      amount: Number((disputeAmount / 100).toFixed(2)),
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
      console.error('[api/stripe/webhook] failed to insert dispute:', insertError)
      return new NextResponse('Dispute insert failed', { status: 500 })
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
      return new NextResponse('Update failed', { status: 500 })
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
    console.error('[api/stripe/webhook] failed to retrieve checkout session:', err.message)
    return new NextResponse('Failed to retrieve payment details', { status: 500 })
  }

  const paymentIntent = expandedSession.payment_intent
  if (typeof paymentIntent !== 'object' || !paymentIntent) {
    console.error('[api/stripe/webhook] payment_intent not expanded')
    return new NextResponse('Payment details incomplete', { status: 500 })
  }

  const rawCharge = paymentIntent.latest_charge
  const chargeId =
    typeof rawCharge === 'string'
      ? rawCharge
      : typeof rawCharge === 'object' && rawCharge
        ? rawCharge.id
        : null
  if (!chargeId) {
    console.error('[api/stripe/webhook] charge id not available')
    return new NextResponse('Payment details incomplete', { status: 500 })
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
        console.error('[api/stripe/webhook] grant_listing_credits failed:', grantError)
        return new NextResponse('Grant failed', { status: 500 })
      }
    } catch (err: any) {
      console.error('[api/stripe/webhook] unexpected error granting credits:', err)
      return new NextResponse('Grant failed', { status: 500 })
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
      console.error('[api/stripe/webhook] failed to update listing payment:', updateError)
      return new NextResponse('Update failed', { status: 500 })
    }

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
    console.error('[api/stripe/webhook] failed to update investment payment:', updateError)
    return new NextResponse('Update failed', { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
