import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing market id' }, { status: 400 })
  }

  const { data: market, error: marketError } = await supabaseAdmin
    .from('markets')
    .select('*')
    .eq('id', id)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  const [{ data: options, error: optionsError }, { data: trades, error: tradesError }] =
    await Promise.all([
      supabaseAdmin.from('market_options').select('*').eq('market_id', id),
      supabaseAdmin
        .from('trades')
        .select('*')
        .eq('market_id', id)
        .order('created_at', { ascending: false }),
    ])

  if (optionsError) {
    return NextResponse.json(
      { error: 'Failed to load market options' },
      { status: 500 }
    )
  }

  if (tradesError) {
    return NextResponse.json(
      { error: 'Failed to load trade history' },
      { status: 500 }
    )
  }

  const optionsMap = new Map(
    (options || []).map((option: any) => [option.id, option.label])
  )

  const mappedTrades = (trades || []).map((trade: any) => ({
    id: trade.id,
    market_id: trade.market_id,
    direction: String(optionsMap.get(trade.option_id) || 'unknown').toLowerCase() as
      | 'yes'
      | 'no'
      | 'unknown',
    usdc_amount: Number(trade.usdc_amount),
    created_at: trade.created_at,
  }))

  return NextResponse.json({
    market,
    options: options || [],
    trades: mappedTrades,
  })
}
