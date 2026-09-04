import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export type LeaderboardItem = {
  startup_id: string
  slug: string
  name: string
  score: number
  weighted: number
  participants: number
  events: number
}

export type GraduatedItem = {
  startup_id: string
  slug: string
  name: string
  graduated_at: string
  amount_raised: string
}

export type ClosestToCrossingItem = {
  id: string
  slug: string
  name: string
  net: number
  threshold: number
  progress: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const phaseParam = searchParams.get('phase') ?? '1'
  const limitParam = searchParams.get('limit') ?? '20'

  const phase = Number(phaseParam)
  const limit = Number(limitParam)

  if (![1, 2, 3].includes(phase)) {
    return NextResponse.json(
      { error: 'phase must be 1, 2, or 3' },
      { status: 400 }
    )
  }

  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { error: 'limit must be between 1 and 100' },
      { status: 400 }
    )
  }

  try {
    if (phase === 3) {
      const { data: graduated, error: gradError } = await (supabaseAdmin as any)
        .from('startup_curve_state')
        .select(
          'graduated_at, pool_usdc::text, startup_id, startup_startups!inner(id, name, slug, logo_url)'
        )
        .not('graduated_at', 'is', null)
        .order('graduated_at', { ascending: false })
        .limit(limit)

      if (gradError) {
        console.error('[api/leaderboard] graduation query error:', gradError)
        return NextResponse.json(
          { error: 'Failed to load leaderboard.' },
          { status: 500 }
        )
      }

      const leaderboard: GraduatedItem[] = (graduated ?? []).map((g: any) => ({
        startup_id: String(g.startup_id ?? ''),
        slug: String(g.startup_startups?.slug ?? ''),
        name: String(g.startup_startups?.name ?? ''),
        graduated_at: String(g.graduated_at ?? ''),
        amount_raised: String(g.pool_usdc ?? 0),
      }))

      return NextResponse.json({ phase, leaderboard })
    }

    const { data: rows, error: rpcError } = await (supabaseAdmin as any).rpc(
      'startup_momentum',
      {
        p_phase: phase,
        p_limit: limit,
      }
    )

    if (rpcError) {
      console.error('[api/leaderboard] startup_momentum RPC error:', rpcError)
      return NextResponse.json(
        { error: 'Failed to load leaderboard.' },
        { status: 500 }
      )
    }

    const leaderboard: LeaderboardItem[] = (rows ?? []).map((r: any) => ({
      startup_id: String(r.startup_id ?? ''),
      slug: String(r.slug ?? ''),
      name: String(r.name ?? ''),
      score: Number(r.score ?? 0),
      weighted: Number(r.weighted ?? 0),
      participants: Number(r.participants ?? 0),
      events: Number(r.events ?? 0),
    }))

    let closestToCrossing: ClosestToCrossingItem[] | undefined
    if (phase === 1) {
      const { data: voting, error: votingError } = await supabaseAdmin
        .from('startup_startups')
        .select(
          'id, slug, name, total_yes_votes, total_no_votes, vote_threshold'
        )
        .eq('phase', 1)
        .is('deleted_at', null)
        .order('phase1_closed_at', { ascending: false }) // unclosed first, then recency

      if (votingError) {
        console.error(
          '[api/leaderboard] closest-to-crossing query error:',
          votingError
        )
      } else {
        closestToCrossing = (voting ?? [])
          .map((s: any) => {
            const yes = Number(s.total_yes_votes ?? 0)
            const no = Number(s.total_no_votes ?? 0)
            const net = yes - no
            const threshold = Number(s.vote_threshold ?? 0)
            const progress =
              threshold > 0
                ? Math.min(1, Math.max(0, net / threshold))
                : 0
            return {
              id: String(s.id),
              slug: String(s.slug ?? ''),
              name: String(s.name ?? ''),
              net,
              threshold,
              progress,
            }
          })
          .filter((s) => s.threshold > 0 && s.progress > 0 && s.progress < 1)
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 5)
      }
    }

    return NextResponse.json({ phase, leaderboard, closestToCrossing })
  } catch (err: any) {
    console.error('[api/leaderboard] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
