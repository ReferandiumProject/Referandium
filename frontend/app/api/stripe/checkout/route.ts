import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Stripe from 'stripe'
import crypto from 'crypto'

// Package prices are defined server-side only. The client sends only a package
// identifier; the server resolves what it costs and what it grants. Never trust
// price or quantity values from the request body.
const PACKAGES = [
  { id: 'listing_1', product: 'listing_pack' as const, credits: 1, amount: 800 },
  { id: 'listing_3', product: 'listing_pack' as const, credits: 3, amount: 2400 },
  { id: 'listing_5', product: 'listing_pack' as const, credits: 5, amount: 4000 },
  { id: 'investment_10', product: 'investment_pack' as const, usdc: 10, amount: 1000 },
  { id: 'investment_25', product: 'investment_pack' as const, usdc: 25, amount: 2500 },
  { id: 'investment_50', product: 'investment_pack' as const, usdc: 50, amount: 5000 },
] as const

type Package = typeof PACKAGES[number]

function findPackage(packageId: unknown): Package | undefined {
  if (typeof packageId !== 'string') return undefined
  return (PACKAGES as readonly Package[]).find((p) => p.id === packageId)
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const pack = findPackage(body?.package_id)
    if (!pack) {
      return NextResponse.json({ error: 'Unknown package' }, { status: 400 })
    }

    const secret = process.env.STRIPE_SECRET_KEY
    if (!secret) {
      console.error('[api/stripe/checkout] STRIPE_SECRET_KEY is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const successUrl = `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/?checkout=cancel`

    const paymentId = crypto.randomUUID()

    const row: Record<string, any> = {
      id: paymentId,
      user_id: user.id,
      product: pack.product,
      amount_charged: pack.amount,
      currency: 'usd',
      status: 'pending',
    }

    if (pack.product === 'listing_pack') {
      row.credits_granted = pack.credits
    } else {
      row.usdc_granted = pack.usdc
      row.release_after = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('stripe_payments')
      .insert(row)
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('[api/stripe/checkout] failed to insert stripe_payments:', insertError)
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
    }

    const stripe = new Stripe(secret, { apiVersion: '2026-07-29.dahlia' })
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: pack.amount,
            product_data: {
              name: pack.product === 'listing_pack' ? 'Listing Credits' : 'Investment Pack',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { payment_id: paymentId },
    })

    if (!session.url) {
      console.error('[api/stripe/checkout] Stripe session did not return a URL')
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('stripe_payments')
      .update({ session_id: session.id })
      .eq('id', paymentId)

    if (updateError) {
      console.error('[api/stripe/checkout] failed to update session id:', updateError)
      return NextResponse.json({ error: 'Failed to store session id' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/stripe/checkout] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
