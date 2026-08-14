import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { PURCHASE_PACKAGES, findPurchasePackage, PurchasePackage } from '@/lib/purchase-packages'
import Stripe from 'stripe'
import crypto from 'crypto'

// Package prices are defined server-side only. The client sends only a package
// identifier; the server resolves what it costs and what it grants. Never trust
// price or quantity values from the request body.

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const rawBody = await request.text()
    let body: any
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch (err: any) {
      console.error('[api/stripe/checkout] invalid JSON body:', rawBody, err?.message)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const packageId = body?.package_id
    console.log('[api/stripe/checkout] received package_id:', packageId)
    const pack = findPurchasePackage(packageId)
    if (!pack) {
      console.error('[api/stripe/checkout] unknown package:', packageId, 'accepted:', PURCHASE_PACKAGES.map((p) => p.id))
      return NextResponse.json({ error: `Unknown package: ${packageId}` }, { status: 400 })
    }

    const secret = process.env.STRIPE_SECRET_KEY
    if (!secret) {
      console.error('[api/stripe/checkout] STRIPE_SECRET_KEY is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    let baseUrl: string
    try {
      baseUrl = new URL(request.url).origin
    } catch (err: any) {
      console.error('[api/stripe/checkout] could not parse request origin:', request.url, err?.message)
      baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    }

    if (!baseUrl) {
      console.error('[api/stripe/checkout] cannot determine checkout redirect URL')
      return NextResponse.json({ error: 'Cannot determine checkout redirect URL' }, { status: 500 })
    }

    const successUrl = `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/?checkout=cancel`

    const paymentId = crypto.randomUUID()
    const amountCents = pack.amount
    const amountDollars = pack.amount / 100

    const row: Record<string, any> = {
      id: paymentId,
      user_id: user.id,
      product: pack.product,
      amount_charged: amountDollars,
      currency: 'usd',
      status: 'pending',
    }

    if (pack.product === 'listing_pack') {
      row.credits_granted = pack.credits
    } else {
      row.usdc_granted = pack.usdc
      row.release_after = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    }

    console.log('[api/stripe/checkout] creating payment for user:', user.id, 'package:', pack.id)

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('stripe_payments')
      .insert(row)
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('[api/stripe/checkout] failed to insert stripe_payments for user:', user.id, 'package:', pack.id, insertError)
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
    }

    const stripe = new Stripe(secret, { apiVersion: '2026-07-29.dahlia' })
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
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
      console.error('[api/stripe/checkout] unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/stripe/checkout] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
