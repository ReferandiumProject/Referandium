import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { isAdmin } from '@/lib/admin'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth.
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing market id' }, { status: 400 })
  }

  // Body.
  let body: { winning_option_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { winning_option_id } = body
  if (!winning_option_id || typeof winning_option_id !== 'string') {
    return NextResponse.json({ error: 'winning_option_id is required' }, { status: 400 })
  }

  // Market.
  const { data: market, error: marketError } = await supabaseAdmin
    .from('markets')
    .select('id, status, creator_id, creator_type')
    .eq('id', id)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  if (market.status !== 'active') {
    return NextResponse.json(
      { error: 'Market is already resolved or not active' },
      { status: 400 }
    )
  }

  // Resolve the market atomically in Postgres
  const { data, error } = await supabaseAdmin.rpc('resolve_market', {
    p_market_id: id,
    p_winning_option_id: winning_option_id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
