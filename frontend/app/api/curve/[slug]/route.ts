import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params

  let userId: string | null = null
  try {
    const user = await getAuthenticatedUser(request)
    userId = user.id
  } catch {
    userId = null
  }

  try {
    const { data: startup, error: startupError } = await supabaseAdmin
      .from('startup_startups')
      .select('id, name, slug')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (startupError) {
      if (startupError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
      }
      console.error('[api/curve/[slug]] startup query error:', startupError)
      return NextResponse.json({ error: startupError.message }, { status: 500 })
    }

    if (!startup) {
      return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
    }

    const { data: curve, error: curveError } = await supabaseAdmin
      .from('startup_curve_state')
      .select('*')
      .eq('startup_id', startup.id)
      .single()

    if (curveError) {
      if (curveError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Curve not found' }, { status: 404 })
      }
      console.error('[api/curve/[slug]] curve query error:', curveError)
      return NextResponse.json({ error: curveError.message }, { status: 500 })
    }

    if (!curve) {
      return NextResponse.json({ error: 'Curve not found' }, { status: 404 })
    }

    const result: any = {
      startup_id: startup.id,
      name: startup.name,
      slug: startup.slug,
      pool_usdc: String(curve.pool_usdc),
      current_price: String(curve.price),
      progress: Number(curve.progress),
      capital_target: String(curve.capital_target),
      graduated: Boolean(curve.graduated_at),
      frozen: Boolean(curve.frozen_at),
    }

    if (userId) {
      const { data: holding, error: holdingError } = await supabaseAdmin
        .from('startup_holdings')
        .select('tokens::text, cost_basis')
        .eq('user_id', userId)
        .eq('startup_id', startup.id)
        .maybeSingle()

      if (holdingError) {
        console.error('[api/curve/[slug]] holding query error:', holdingError)
        return NextResponse.json({ error: holdingError.message }, { status: 500 })
      }

      const { data: balance, error: balanceError } = await supabaseAdmin
        .from('balances')
        .select('available_usdc')
        .eq('user_id', userId)
        .single()

      if (balanceError) {
        console.error('[api/curve/[slug]] balance query error:', balanceError)
        return NextResponse.json({ error: balanceError.message }, { status: 500 })
      }

      result.user_holding = holding
        ? { tokens: String(holding.tokens), cost_basis: String(holding.cost_basis) }
        : null
      result.available_usdc = balance ? String(balance.available_usdc) : null
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[api/curve/[slug]] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
