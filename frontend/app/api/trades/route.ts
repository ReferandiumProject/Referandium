import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TradeBody {
  market_id: string
  option_id: string
  type: 'buy' | 'sell'
  shares: number
}

export async function POST(request: NextRequest) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: TradeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { market_id, option_id, type, shares } = body

  if (!market_id || typeof market_id !== 'string') {
    return NextResponse.json({ error: 'market_id is required' }, { status: 400 })
  }
  if (!option_id || typeof option_id !== 'string') {
    return NextResponse.json({ error: 'option_id is required' }, { status: 400 })
  }
  if (type !== 'buy' && type !== 'sell') {
    return NextResponse.json({ error: "type must be 'buy' or 'sell'" }, { status: 400 })
  }
  if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
    return NextResponse.json({ error: 'shares must be a positive number' }, { status: 400 })
  }

  // Execute the trade atomically in Postgres
  const { data, error } = await supabaseAdmin.rpc('execute_trade', {
    p_user_id: user.id,
    p_market_id: market_id,
    p_option_id: option_id,
    p_type: type,
    p_shares: shares,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    updatedPrice: data.updated_price,
    newBalance: data.new_balance,
    trade: data.trade,
  })
}
