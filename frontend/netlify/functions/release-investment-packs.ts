import { supabaseAdmin } from '../../lib/supabaseServer'
import { backfillInvestmentPacks } from '../../lib/backfill-investment-packs'

const STALE_PENDING_HOURS = 48

export async function closeStalePendingPayments(userId?: string | null): Promise<number> {
  const now = new Date().toISOString()
  const cutoff = new Date(Date.now() - STALE_PENDING_HOURS * 60 * 60 * 1000).toISOString()

  let query = supabaseAdmin
    .from('stripe_payments')
    .update({ status: 'failed', updated_at: now })
    .eq('status', 'pending')
    .lt('created_at', cutoff)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query.select('id')

  if (error) {
    console.error('[netlify/scheduled] closeStalePendingPayments failed:', error)
    throw new Error(`closeStalePendingPayments failed: ${error.message}`)
  }

  return data?.length ?? 0
}

export default async (): Promise<Response> => {
  await backfillInvestmentPacks(null)

  const { data, error } = await supabaseAdmin.rpc('release_due_investment_packs', {
    p_user_id: null,
  })

  if (error) {
    console.error('[netlify/scheduled] release_due_investment_packs failed:', error)
    return new Response('Release failed', { status: 500 })
  }

  const result = Array.isArray(data) ? data[0] : data
  const count = Number(result?.r_released_count ?? 0)
  const usdc = Number(result?.r_released_usdc ?? 0)

  const closed = await closeStalePendingPayments()

  console.log(`[netlify/scheduled] released ${count} packs, ${usdc} USDC, closed ${closed} stale pending payments`)
  return new Response(
    `Released ${count} packs, ${usdc} USDC, closed ${closed} stale pending payments`,
    { status: 200 }
  )
}

export const config = {
  schedule: '0 * * * *',
}
