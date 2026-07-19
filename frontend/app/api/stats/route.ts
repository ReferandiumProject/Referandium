import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [{ count: activeMarkets }, { data: trades }, { count: traders }] =
    await Promise.all([
      supabaseAdmin
        .from('markets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabaseAdmin.from('trades').select('usdc_amount'),
      supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true }),
    ])

  const volume = (trades || []).reduce(
    (sum: number, trade: { usdc_amount?: number }) =>
      sum + Number(trade.usdc_amount || 0),
    0
  )

  return NextResponse.json({
    volume,
    activeMarkets: activeMarkets || 0,
    traders: traders || 0,
  })
}
