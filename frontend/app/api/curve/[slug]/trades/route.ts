import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { buildCurveOHLC } from '@/lib/curve-time-series'
import { recordSystemError } from '@/lib/system-errors'

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
      .select('graduated_at')
      .eq('startup_id', startup.id)
      .single()

    if (curveError) {
      console.error('[api/curve/[slug]/trades] curve query error:', curveError)
      return NextResponse.json(
        { error: curveError.message },
        { status: 500 }
      )
    }

    const { data: rows, error: ohlcError } = await supabaseAdmin.rpc(
      'curve_ohlc',
      { p_startup_id: startup.id, p_interval: '1 hour' }
    )

    if (ohlcError) {
      await recordSystemError({
        source: 'server',
        name: 'curve_ohlc_rpc',
        message: ohlcError.message,
        path: `/api/curve/${slug}/trades`,
        context: { startup_id: startup.id, slug, interval: '1 hour' },
      })
      return NextResponse.json(
        { error: 'Price history is unavailable right now.' },
        { status: 500 }
      )
    }

    const ohlc = buildCurveOHLC(rows ?? [])

    return NextResponse.json({
      startup_id: startup.id,
      name: startup.name,
      slug,
      ohlc,
      graduated: Boolean(curve?.graduated_at),
    })
  } catch (err: any) {
    console.error('[api/curve/[slug]/trades] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
