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
      .select('id, name, slug, description, logo_url, total_yes_votes, total_no_votes, vote_threshold')
      .eq('phase', 1)
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
      .map((s) => {
        const totalYes = Number(s.total_yes_votes ?? 0)
        const totalNo = Number(s.total_no_votes ?? 0)
        const net = totalYes - totalNo
        const threshold = Number(s.vote_threshold ?? 0)
        const progress = threshold > 0 ? Math.min(100, Math.max(0, (net / threshold) * 100)) : 0

        const item: any = {
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          logo_url: s.logo_url,
          total_yes_votes: totalYes,
          total_no_votes: totalNo,
          vote_threshold: threshold,
          net,
          progress,
        }

        if (userId) {
          const pos = allocations[s.id]
          item.user_position = pos ? { direction: pos.direction, votes: pos.votes } : null
        }

        return item
      })
      .sort((a, b) => b.total_yes_votes + b.total_no_votes - (a.total_yes_votes + a.total_no_votes))

    return NextResponse.json(results)
  } catch (err: any) {
    console.error('[api/startup-votes/list] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
