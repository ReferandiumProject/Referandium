import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: startups, error: startupsError } = await supabaseAdmin
      .from('startup_startups')
      .select(
        `
        id, name, slug, description, pitch, website, twitter, logo_url, stage,
        phase, vote_threshold, capital_target::text, total_yes_votes, total_no_votes,
        created_at, phase1_closed_at
        `
      )
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (startupsError) {
      console.error('[api/my-startups] startups query error:', startupsError)
      return NextResponse.json({ error: startupsError.message }, { status: 500 })
    }

    if (!startups || startups.length === 0) {
      return NextResponse.json([])
    }

    const ids = startups.map((s: any) => s.id)
    const phase23Ids = startups.filter((s: any) => s.phase === 2 || s.phase === 3).map((s: any) => s.id)

    // Two extra queries total, regardless of how many startups the founder
    // has, rather than one per startup.
    const [statsRes, curveRes] = await Promise.all([
      supabaseAdmin
        .from('startup_founder_stats')
        .select(
          'startup_id, active_voters, lifetime_voters, token_holders, trade_count, platform_fees_generated::text'
        )
        .in('startup_id', ids),
      phase23Ids.length > 0
        ? supabaseAdmin
            .from('startup_curve_state')
            .select('startup_id, pool_usdc::text, capital_target::text, price::text, progress, graduated_at, frozen_at')
            .in('startup_id', phase23Ids)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (statsRes.error) {
      console.error('[api/my-startups] founder stats query error:', statsRes.error)
      return NextResponse.json({ error: statsRes.error.message }, { status: 500 })
    }
    if (curveRes.error) {
      console.error('[api/my-startups] curve state query error:', curveRes.error)
      return NextResponse.json({ error: curveRes.error.message }, { status: 500 })
    }

    const statsById = new Map((statsRes.data ?? []).map((row: any) => [row.startup_id, row]))
    const curveById = new Map((curveRes.data ?? []).map((row: any) => [row.startup_id, row]))

    const result = startups.map((s: any) => {
      const stats = statsById.get(s.id)
      const curve = curveById.get(s.id)

      return {
        ...s,
        founder_stats: {
          active_voters: stats?.active_voters ?? 0,
          lifetime_voters: stats?.lifetime_voters ?? 0,
          token_holders: stats?.token_holders ?? 0,
          trade_count: stats?.trade_count ?? 0,
          platform_fees_generated: stats?.platform_fees_generated ?? '0',
        },
        curve: curve
          ? {
              pool_usdc: curve.pool_usdc,
              capital_target: curve.capital_target,
              price: curve.price,
              progress: curve.progress,
              graduated: Boolean(curve.graduated_at),
              frozen: Boolean(curve.frozen_at),
            }
          : null,
      }
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[api/my-startups] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
