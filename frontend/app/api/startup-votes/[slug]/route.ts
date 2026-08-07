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
      .select(
        'id, name, slug, description, logo_url, total_yes_votes, total_no_votes, vote_threshold, phase, capital_target'
      )
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (startupError) {
      if (startupError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
      }
      console.error('[api/startup-votes/[slug]] startup query error:', startupError)
      return NextResponse.json({ error: startupError.message }, { status: 500 })
    }

    if (!startup) {
      return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
    }

    const totalYes = Number(startup.total_yes_votes ?? 0)
    const totalNo = Number(startup.total_no_votes ?? 0)
    const net = totalYes - totalNo
    const threshold = Number(startup.vote_threshold ?? 0)
    const progress = threshold > 0 ? Math.min(100, Math.max(0, (net / threshold) * 100)) : 0

    const result: any = {
      id: startup.id,
      name: startup.name,
      slug: startup.slug,
      description: startup.description,
      logo_url: startup.logo_url,
      total_yes_votes: totalYes,
      total_no_votes: totalNo,
      vote_threshold: threshold,
      net,
      progress,
      phase: startup.phase,
      capital_target: startup.capital_target,
    }

    if (userId) {
      const { data: allocation, error: allocError } = await supabaseAdmin
        .from('startup_vote_allocations')
        .select('direction, votes')
        .eq('user_id', userId)
        .eq('startup_id', startup.id)
        .is('burned_at', null)
        .maybeSingle()

      if (allocError) {
        console.error('[api/startup-votes/[slug]] allocation query error:', allocError)
        return NextResponse.json({ error: allocError.message }, { status: 500 })
      }

      result.user_position = allocation
        ? { direction: allocation.direction, votes: Number(allocation.votes ?? 0) }
        : null
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[api/startup-votes/[slug]] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
