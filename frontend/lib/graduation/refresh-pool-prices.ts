import { supabaseAdmin } from '@/lib/supabaseServer'
import { recordSystemError } from '@/lib/system-errors'
import { readPoolPrice } from './pool-price'

const DEFAULT_MAX_AGE_MINUTES = 5

export async function refreshStalePoolPrices(maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString()

  const { data: graduations, error } = await supabaseAdmin
    .from('graduations')
    .select('id, pool_address, mint_address')
    .not('pool_address', 'is', null)
    .or(`pool_price_read_at.is.null,pool_price_read_at.lt.${cutoff}`)

  if (error) {
    console.error('[refresh-pool-prices] failed to list stale graduations:', error)
    throw new Error(`Failed to list stale graduations: ${error.message}`)
  }

  const results = { refreshed: 0, failed: 0, skipped: 0 }

  for (const grad of graduations ?? []) {
    if (!grad.pool_address || !grad.mint_address) {
      results.skipped++
      continue
    }

    try {
      const price = await readPoolPrice(grad.pool_address, grad.mint_address)
      const readAt = new Date().toISOString()

      const { error: updateError } = await supabaseAdmin
        .from('graduations')
        .update({ pool_price: price, pool_price_read_at: readAt })
        .eq('id', grad.id)

      if (updateError) {
        throw updateError
      }

      results.refreshed++
      console.log(`[refresh-pool-prices] refreshed ${grad.id}: ${price} at ${readAt}`)
    } catch (err: any) {
      results.failed++
      console.error(`[refresh-pool-prices] failed for ${grad.id}:`, err)
      void recordSystemError({
        source: 'swallowed',
        name: 'RefreshPoolPriceFailed',
        message: err?.message ?? 'Failed to refresh pool price',
        path: 'lib/graduation/refresh-pool-prices.ts',
        context: { graduation_id: grad.id, pool_address: grad.pool_address },
      })
    }
  }

  return results
}
