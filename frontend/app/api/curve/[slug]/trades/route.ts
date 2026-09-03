import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params

  try {
    const user = await getAuthenticatedUser(request)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _userId = user.id
  } catch {
    // Public endpoint: the curve history does not require authentication.
  }

  try {
    const { data: startup, error: startupError } = await supabaseAdmin
      .from('startup_startups')
      .select('id, name')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (startupError) {
      if (startupError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
      }
      console.error('[api/curve/[slug]/trades] startup query error:', startupError)
      return NextResponse.json(
        { error: startupError.message },
        { status: 500 }
      )
    }

    if (!startup) {
      return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
    }

    const { data: curve, error: curveError } = await supabaseAdmin
      .from('startup_curves')
      .select('initial_v_t::text, initial_v_s::text, graduated_at')
      .eq('startup_id', startup.id)
      .single()

    if (curveError) {
      console.error('[api/curve/[slug]/trades] curve query error:', curveError)
      return NextResponse.json(
        { error: curveError.message },
        { status: 500 }
      )
    }

    const { data: trades, error: tradesError } = await supabaseAdmin
      .from('startup_curve_trades')
      .select(
        'id, side, usdc_gross::text, tokens::text, price_after::text, pool_usdc_after::text'
      )
      .eq('startup_id', startup.id)
      .order('id')

    if (tradesError) {
      console.error('[api/curve/[slug]/trades] trades query error:', tradesError)
      return NextResponse.json(
        { error: tradesError.message },
        { status: 500 }
      )
    }

    const openingPrice = Decimal.parse(curve.initial_v_t)
      .div(Decimal.parse(curve.initial_v_s), 18)
      .toString()

    return NextResponse.json({
      startup_id: startup.id,
      name: startup.name,
      slug,
      opening_price: openingPrice,
      trades: trades ?? [],
      graduated: Boolean(curve.graduated_at),
    })
  } catch (err: any) {
    console.error('[api/curve/[slug]/trades] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
