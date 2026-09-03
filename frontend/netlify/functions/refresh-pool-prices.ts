import { refreshStalePoolPrices } from '../../lib/graduation/refresh-pool-prices'

export default async (): Promise<Response> => {
  try {
    const results = await refreshStalePoolPrices(5)
    const text = `Refreshed ${results.refreshed} pool prices, ${results.failed} failed, ${results.skipped} skipped`
    console.log(`[netlify/scheduled] ${text}`)
    return new Response(text, { status: 200 })
  } catch (err: any) {
    console.error('[netlify/scheduled] refresh-pool-prices failed:', err)
    return new Response(`Refresh failed: ${err?.message ?? err}`, { status: 500 })
  }
}

export const config = {
  schedule: '*/5 * * * *',
}
