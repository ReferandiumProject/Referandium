import Stripe from 'stripe'
import { supabaseAdmin } from './supabaseServer'
import { Money } from './money'
import { recordSystemError } from './system-errors'

export async function backfillInvestmentPacks(userId: string | null = null) {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  const stripe = new Stripe(apiKey, { apiVersion: '2026-07-29.dahlia' })

  let query = supabaseAdmin
    .from('stripe_payments')
    .select('id, product, user_id, amount_charged, currency, stripe_charge_id')
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

      const amountCharged = Money.fromDollars(Number(row.amount_charged))
      const settlementGross = Money.fromCents(balance.amount)
      const fee = Money.fromCents(balance.fee)
      const net = settlementGross.minus(fee)
      const settlementCurrency = (balance.currency || 'usd').toLowerCase()
      const availableOn = balance.available_on
      if (
        !Number.isFinite(amountCharged.toCents()) ||
        !Number.isFinite(settlementGross.toCents()) ||
        !Number.isFinite(fee.toCents()) ||
        typeof availableOn !== 'number'
      ) {
        console.warn(
          `[backfill-investment-packs] incomplete balance transaction for ${row.stripe_charge_id}`
        )
        skipped++
        continue
      }

      const availableAt = new Date(availableOn * 1000).toISOString()
      const stripeFee = fee.toDollars()
      const settlementGrossDollars = settlementGross.toDollars()
      const settlementNetDollars = net.toDollars()

      const chargeCurrency = (row.currency || 'usd').toLowerCase()
      let exchangeRate: number | null = null
      if (chargeCurrency === settlementCurrency) {
        exchangeRate = 1
      } else if (typeof balance.exchange_rate === 'number' && balance.exchange_rate > 0) {
        exchangeRate = Number(balance.exchange_rate.toFixed(6))
      } else if (settlementGross.toCents() > 0 && amountCharged.toCents() > 0) {
        exchangeRate = Number((settlementGross.toCents() / amountCharged.toCents()).toFixed(6))
      }

      if (exchangeRate === null || exchangeRate <= 0) {
        console.warn(
          `[backfill-investment-packs] cannot determine exchange rate for ${row.stripe_charge_id}`
        )
        skipped++
        continue
      }

      const netUsdcMoney = net.dividedBy(exchangeRate)
      const netUsdc = netUsdcMoney.toDollars()

      const minUsdc = amountCharged.toDollars() * 0.8
      const maxUsdc = amountCharged.toDollars() * 1.5
      if (Number(netUsdc) < minUsdc || Number(netUsdc) > maxUsdc) {
        console.error(
          `[backfill-investment-packs] implausible usdc_granted ${netUsdc} for ${row.id} (allowed ${minUsdc}..${maxUsdc})`
        )
        skipped++
        continue
      }

      const isInvestment = row.product === 'investment_pack'
      const updateValues: Record<string, any> = {
        settlement_currency: settlementCurrency,
        settlement_gross: settlementGrossDollars,
        settlement_net: settlementNetDollars,
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
        void recordSystemError({
          source: 'swallowed',
          name: 'BackfillInvestmentPackUpdateFailed',
          message: updateError.message,
          path: 'lib/backfill-investment-packs.ts',
          context: { rowId: row.id, stripeChargeId: row.stripe_charge_id, updateError: { message: updateError.message, code: updateError.code } },
        })
        skipped++
      } else {
        filled++
      }
    } catch (err: any) {
      console.error(
        `[backfill-investment-packs] error for charge ${row.stripe_charge_id}:`,
        err?.message ?? err
      )
      void recordSystemError({
        source: 'swallowed',
        name: 'BackfillInvestmentPackChargeFailed',
        message: err?.message ?? 'backfill charge failed',
        path: 'lib/backfill-investment-packs.ts',
        context: { rowId: row.id, stripeChargeId: row.stripe_charge_id, stack: err?.stack },
      })
      skipped++
    }
  }

  console.log(`[backfill-investment-packs] filled ${filled}, skipped ${skipped}`)
  return { filled, skipped }
}
