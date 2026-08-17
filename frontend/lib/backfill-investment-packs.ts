import Stripe from 'stripe'
import { supabaseAdmin } from './supabaseServer'

export async function backfillInvestmentPacks(userId: string | null = null) {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  const stripe = new Stripe(apiKey, { apiVersion: '2026-07-29.dahlia' })

  let query = supabaseAdmin
    .from('stripe_payments')
    .select('id, product, user_id, amount_charged, stripe_charge_id')
    .or(
      'and(product.eq.investment_pack,usdc_granted.is.null),and(product.eq.listing_pack,settlement_gross.is.null)'
    )
    .not('stripe_charge_id', 'is', null)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: rows, error } = await query
  if (error) {
    throw new Error(`Failed to fetch unsettled packs: ${error.message}`)
  }
  if (!rows || rows.length === 0) {
    return { filled: 0, skipped: 0 }
  }

  let filled = 0
  let skipped = 0

  for (const row of rows) {
    try {
      const charge = await stripe.charges.retrieve(row.stripe_charge_id, {
        expand: ['balance_transaction'],
      })

      const balance = charge.balance_transaction
      if (typeof balance !== 'object' || !balance) {
        console.log(
          `[backfill-investment-packs] balance transaction not yet ready for ${row.stripe_charge_id}`
        )
        skipped++
        continue
      }

      const grossCents = row.amount_charged
      const settlementGrossCents = balance.amount
      const feeCents = balance.fee
      const settlementCurrency = (balance.currency || 'usd').toLowerCase()
      const availableOn = balance.available_on
      if (
        typeof grossCents !== 'number' ||
        typeof settlementGrossCents !== 'number' ||
        typeof feeCents !== 'number' ||
        typeof availableOn !== 'number'
      ) {
        console.warn(
          `[backfill-investment-packs] incomplete balance transaction for ${row.stripe_charge_id}`
        )
        skipped++
        continue
      }

      const availableAt = new Date(availableOn * 1000).toISOString()
      const stripeFee = Number((feeCents / 100).toFixed(6))
      const settlementNetCents = settlementGrossCents - feeCents
      const settlementGross = Number((settlementGrossCents / 100).toFixed(6))
      const settlementNet = Number((settlementNetCents / 100).toFixed(6))

      let exchangeRate: number | null = null
      if (typeof balance.exchange_rate === 'number' && balance.exchange_rate > 0) {
        exchangeRate = balance.exchange_rate
      } else if (grossCents > 0 && settlementGrossCents > 0) {
        exchangeRate = settlementGrossCents / grossCents
      }

      if (exchangeRate === null || exchangeRate <= 0) {
        console.warn(
          `[backfill-investment-packs] cannot determine exchange rate for ${row.stripe_charge_id}`
        )
        skipped++
        continue
      }

      const netUsdCents = Math.round(settlementNetCents / exchangeRate)
      const netUsdc = Number((netUsdCents / 100).toFixed(6))

      const isInvestment = row.product === 'investment_pack'
      const updateValues: Record<string, any> = {
        settlement_currency: settlementCurrency,
        settlement_gross: settlementGross,
        settlement_net: settlementNet,
        stripe_exchange_rate: exchangeRate,
        stripe_fee: stripeFee,
        funds_available_on: availableAt,
      }

      if (isInvestment) {
        updateValues.usdc_granted = netUsdc
        updateValues.release_after = availableAt
      }

      const update = supabaseAdmin
        .from('stripe_payments')
        .update(updateValues)
        .eq('id', row.id)

      if (isInvestment) {
        update.is('usdc_granted', null)
      } else {
        update.is('settlement_gross', null)
      }

      const { error: updateError } = await update
      if (updateError) {
        console.error(
          `[backfill-investment-packs] update failed for ${row.id}:`,
          updateError
        )
        skipped++
      } else {
        filled++
      }
    } catch (err: any) {
      console.error(
        `[backfill-investment-packs] error for charge ${row.stripe_charge_id}:`,
        err?.message ?? err
      )
      skipped++
    }
  }

  console.log(`[backfill-investment-packs] filled ${filled}, skipped ${skipped}`)
  return { filled, skipped }
}
