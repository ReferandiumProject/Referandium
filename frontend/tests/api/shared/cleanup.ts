import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'

const PLATFORM_USER_ID = '8eab2b35-eee6-41c7-843c-9b878af389f1'

export async function retractPlatformFees(
  startupIds: string[],
  userIds: string[] = [],
  listingStartupIds: string[] = []
): Promise<void> {
  if (startupIds.length === 0 && userIds.length === 0 && listingStartupIds.length === 0) return

  let curveFees = Decimal.parse('0')

  if (startupIds.length > 0) {
    const { data: trades, error: tradesError } = await supabaseAdmin
      .from('startup_curve_trades')
      .select('fee')
      .in('startup_id', startupIds)

    if (tradesError) {
      console.error('[cleanup] failed to read curve trade fees:', tradesError)
      throw new Error(`Failed to read curve trade fees: ${tradesError.message}`)
    }

    for (const row of trades ?? []) {
      if (row.fee != null) {
        curveFees = curveFees.add(Decimal.parse(String(row.fee)))
      }
    }
  }

  let listingFees = Decimal.parse('0')

  if (listingStartupIds.length > 0) {
    const { data: creditEvents, error: creditError } = await supabaseAdmin
      .from('listing_credit_events')
      .select('startup_id')
      .in('user_id', userIds)
      .in('startup_id', listingStartupIds)
      .eq('reason', 'listing')
      .eq('delta', -1)

    if (creditError) {
      console.error('[cleanup] failed to read listing credit events:', creditError)
      throw new Error(`Failed to read listing credit events: ${creditError.message}`)
    }

    const creditStartups = new Set((creditEvents ?? []).map((row) => row.startup_id))
    const balanceListingCount = listingStartupIds.filter((id) => !creditStartups.has(id)).length
    listingFees = Decimal.parse(String(balanceListingCount * 8))
  }

  const totalFees = curveFees.add(listingFees)
  if (totalFees.isZero()) return

  const { data: platformBalance, error: balanceError } = await supabaseAdmin
    .from('balances')
    .select('available_usdc')
    .eq('user_id', PLATFORM_USER_ID)
    .single()

  if (balanceError) {
    console.error('[cleanup] failed to read platform balance:', balanceError)
    throw new Error(`Failed to read platform balance: ${balanceError.message}`)
  }

  const current = Decimal.parse(String(platformBalance!.available_usdc ?? '0'))
  const after = current.sub(totalFees)

  const { error: updateError } = await supabaseAdmin
    .from('balances')
    .update({ available_usdc: after.toString() })
    .eq('user_id', PLATFORM_USER_ID)

  if (updateError) {
    console.error('[cleanup] failed to retract platform fees:', updateError)
    throw new Error(`Failed to retract platform fees: ${updateError.message}`)
  }

  console.log(`[cleanup] retracted ${totalFees.toString()} USDC from platform user`)
}
