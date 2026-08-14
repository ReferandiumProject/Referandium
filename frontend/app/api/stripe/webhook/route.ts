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

  let event: Stripe.Event
  try {
    const stripe = new Stripe(apiKey, { apiVersion: '2026-07-29.dahlia' })
    event = stripe.webhooks.constructEvent(payload, sig, secret)
  } catch (err: any) {
    console.error('[api/stripe/webhook] signature verification failed:', err.message)
    return new NextResponse('Invalid signature', { status: 400 })
  }

  if (
    !CHECKOUT_SUCCESS_EVENTS.has(event.type) &&
    event.type !== 'checkout.session.async_payment_failed' &&
    event.type !== 'charge.dispute.created'
  ) {
    return new NextResponse(null, { status: 200 })
  }

  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute
    console.log(
      '[api/stripe/webhook] dispute created:',
      dispute.id,
      'for charge:',
      (dispute as any).charge
    )
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

  if (event.type === 'checkout.session.async_payment_failed') {
    await supabaseAdmin
      .from('stripe_payments')
      .update({ status: 'failed', stripe_event_id: event.id })
      .eq('id', paymentId)
    return new NextResponse(null, { status: 200 })
  }

  if (row.status !== 'pending') {
    return new NextResponse(null, { status: 200 })
  }

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
      .update({ status: 'granted', stripe_event_id: event.id })
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
    .update({ status: 'paid', stripe_event_id: event.id })
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
