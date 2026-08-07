import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const { data: grantData, error: grantError } = await supabaseAdmin.rpc(
      'claim_daily_grant',
      { p_user_id: user.id }
    )

    if (grantError) {
      console.error('[api/startup-votes/mine] claim_daily_grant error:', grantError)
      return NextResponse.json(
        { error: grantError.message || 'Failed to load vote balance' },
        { status: 500 }
      )
    }

    const grant = Array.isArray(grantData) ? grantData[0] : grantData

    const remainingToday = Number(grant?.r_remaining ?? 0)

    const { data: poolData, error: poolError } = await supabaseAdmin
      .from('startup_vote_pool')
      .select('available')
      .eq('user_id', user.id)
      .single()

    if (poolError && poolError.code !== 'PGRST116') {
      console.error('[api/startup-votes/mine] pool query error:', poolError)
      return NextResponse.json(
        { error: poolError.message || 'Failed to load vote balance' },
        { status: 500 }
      )
    }

    const poolBalance = Number(poolData?.available ?? 0)

    const { data: allocations, error: allocError } = await supabaseAdmin
      .from('startup_vote_allocations')
      .select(
        'id, startup_id, direction, votes, burned_at, startup_startups!inner(name, slug, logo_url, phase, total_yes_votes, total_no_votes, vote_threshold, deleted_at)'
      )
      .eq('user_id', user.id)
      .gt('votes', 0)
      .is('startup_startups.deleted_at', null)

    if (allocError) {
      console.error('[api/startup-votes/mine] allocations query error:', allocError)
      return NextResponse.json(
        { error: allocError.message || 'Failed to load positions' },
        { status: 500 }
      )
    }

    const active: any[] = []
    const burned: any[] = []

    for (const row of allocations ?? []) {
      const startup = (row as any).startup_startups as any
      const totalYes = Number(startup?.total_yes_votes ?? 0)
      const totalNo = Number(startup?.total_no_votes ?? 0)
      const net = totalYes - totalNo
      const threshold = Number(startup?.vote_threshold ?? 0)
      const progress = threshold > 0 ? Math.min(100, Math.max(0, (net / threshold) * 100)) : 0

      const item = {
        startup_id: row.startup_id,
        name: startup?.name ?? null,
        slug: startup?.slug ?? null,
        logo_url: startup?.logo_url ?? null,
        phase: startup?.phase ?? 1,
        total_yes_votes: totalYes,
        total_no_votes: totalNo,
        vote_threshold: threshold,
        net,
        progress,
        direction: row.direction,
        votes: Number(row.votes ?? 0),
      }

      if (row.burned_at) {
        burned.push({ ...item, burned_at: row.burned_at })
      } else {
        active.push(item)
      }
    }

    return NextResponse.json({
      balance: {
        grant_date: grant?.r_grant_date ?? null,
        granted_today: Number(grant?.r_granted ?? 0),
        remaining_today: remainingToday,
        newly_granted: Boolean(grant?.r_newly_granted ?? false),
        pool_balance: poolBalance,
        total_spendable: remainingToday + poolBalance,
      },
      active,
      burned,
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/startup-votes/mine] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
