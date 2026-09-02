import { supabaseAdmin } from '../../lib/supabaseServer'
import { backfillInvestmentPacks } from '../../lib/backfill-investment-packs'
import { scanAndSweepUserDeposits } from '../../lib/scan-user-deposits'
import { recordSystemError } from '../../lib/system-errors'

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

  try {
    await scanAndSweepUserDeposits(null)
  } catch (err: any) {
    console.error('[netlify/scheduled] scanAndSweepUserDeposits failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'ScheduledScanAndSweepFailed',
      message: err?.message ?? 'scanAndSweepUserDeposits failed',
      path: 'netlify/functions/release-investment-packs.ts',
      context: { stack: err?.stack },
    })
  }

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

  let integrityText = 'integrity unavailable'
  try {
    const { data: checks, error: checksError } = await supabaseAdmin.rpc('run_integrity_checks')
    if (checksError) throw checksError
    const summary = (checks ?? []).map((c: any) => `${c.r_check}=${c.r_status}`).join(', ')
    integrityText = `integrity: ${summary}`
  } catch (err: any) {
    console.error('[netlify/scheduled] run_integrity_checks failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'ScheduledIntegrityChecksFailed',
      message: err?.message ?? 'run_integrity_checks failed',
      path: 'netlify/functions/release-investment-packs.ts',
      context: { stack: err?.stack },
    })
    integrityText = `integrity failed: ${err?.message ?? err}`
  }

  console.log(`[netlify/scheduled] released ${count} packs, ${usdc} USDC, closed ${closed} stale pending payments; ${integrityText}`)
  return new Response(
    `Released ${count} packs, ${usdc} USDC, closed ${closed} stale pending payments; ${integrityText}`,
    { status: 200 }
  )
}

export const config = {
  schedule: '0 * * * *',
}
