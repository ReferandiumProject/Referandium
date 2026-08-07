import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  let userId: string | null = null
  try {
    const user = await getAuthenticatedUser(request)
    userId = user.id
  } catch {
    userId = null
  }

  try {
    const { data: startups, error: startupsError } = await supabaseAdmin
      .from('startup_startups')
      .select(
        `
        id,
        name,
        slug,
        description,
        logo_url,
        phase,
        total_yes_votes,
        total_no_votes,
        vote_threshold,
        startup_curve_state (
          pool_usdc::text,
          price::text,
          capital_target::text,
          progress,
          graduated_at,
          frozen_at
        )
      `
      )
      .is('deleted_at', null)

    if (startupsError) {
      console.error('[api/startup-votes/list] startups query error:', startupsError)
      return NextResponse.json({ error: startupsError.message }, { status: 500 })
    }

    const startupList = startups ?? []

    let allocations: Record<string, { direction: string; votes: number }> = {}
    if (userId && startupList.length > 0) {
      const startupIds = startupList.map((s) => s.id)
      const { data: allocData, error: allocError } = await supabaseAdmin
        .from('startup_vote_allocations')
        .select('startup_id, direction, votes')
        .eq('user_id', userId)
        .is('burned_at', null)
        .in('startup_id', startupIds)

      if (allocError) {
        console.error('[api/startup-votes/list] allocations query error:', allocError)
        return NextResponse.json({ error: allocError.message }, { status: 500 })
      }

      allocations = (allocData ?? []).reduce((acc, a) => {
        acc[a.startup_id] = {
          direction: a.direction,
          votes: Number(a.votes ?? 0),
        }
        return acc
      }, {} as Record<string, { direction: string; votes: number }>)
    }

    const results = startupList
      .map((s: any) => {
        const phase = Number(s.phase ?? 1)

        const item: any = {
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          logo_url: s.logo_url,
          phase,
        }

        if (phase === 1) {
          const totalYes = Number(s.total_yes_votes ?? 0)
          const totalNo = Number(s.total_no_votes ?? 0)
          const net = totalYes - totalNo
          const threshold = Number(s.vote_threshold ?? 0)
          const progress = threshold > 0 ? Math.min(100, Math.max(0, (net / threshold) * 100)) : 0

          item.total_yes_votes = totalYes
          item.total_no_votes = totalNo
          item.vote_threshold = threshold
          item.net = net
          item.progress = progress

          if (userId) {
            const pos = allocations[s.id]
            item.user_position = pos ? { direction: pos.direction, votes: pos.votes } : null
          }
        } else {
          const curve = s.startup_curve_state
          item.curve = {
            pool_usdc: String(curve?.pool_usdc ?? 0),
            capital_target: String(curve?.capital_target ?? 0),
            current_price: String(curve?.price ?? 0),
            progress: Number(curve?.progress ?? 0),
            graduated: Boolean(curve?.graduated_at),
            frozen: Boolean(curve?.frozen_at),
          }
        }

        return item
      })
      .sort((a, b) => {
        const aVotes = (a.total_yes_votes ?? 0) + (a.total_no_votes ?? 0)
        const bVotes = (b.total_yes_votes ?? 0) + (b.total_no_votes ?? 0)
        return bVotes - aVotes
      })

    return NextResponse.json(results)
  } catch (err: any) {
    console.error('[api/startup-votes/list] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
