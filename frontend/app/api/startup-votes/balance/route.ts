import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { backfillInvestmentPacks } from '@/lib/backfill-investment-packs'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    try {
      await backfillInvestmentPacks(user.id)
    } catch (err: any) {
      console.error('[api/startup-votes/balance] backfillInvestmentPacks error:', err?.message ?? err)
    }

    const { data: grantData, error: grantError } = await supabaseAdmin.rpc(
      'claim_daily_grant',
      { p_user_id: user.id }
    )

    if (grantError) {
      console.error('[api/startup-votes/balance] claim_daily_grant error:', grantError)
      return NextResponse.json({ error: grantError.message }, { status: 500 })
    }

    const grant = Array.isArray(grantData) ? grantData[0] : grantData

    if (!grant) {
      console.error('[api/startup-votes/balance] claim_daily_grant returned no data')
      return NextResponse.json({ error: 'Failed to claim daily grant' }, { status: 500 })
    }

    const { data: releaseData, error: releaseError } = await supabaseAdmin.rpc(
      'release_due_investment_packs',
      { p_user_id: user.id }
    )

    if (releaseError) {
      console.error('[api/startup-votes/balance] release_due_investment_packs error:', releaseError)
    }

    const release = Array.isArray(releaseData) ? releaseData[0] : releaseData

    const { data: poolData, error: poolError } = await supabaseAdmin
      .from('startup_vote_pool')
      .select('available')
      .eq('user_id', user.id)
      .single()

    if (poolError && poolError.code !== 'PGRST116') {
      console.error('[api/startup-votes/balance] startup_vote_pool fetch error:', poolError)
      return NextResponse.json({ error: poolError.message }, { status: 500 })
    }

    const poolBalance = Number(poolData?.available ?? 0)
    const remainingToday = Number(grant.r_remaining ?? 0)

    return NextResponse.json({
      grant_date: grant.r_grant_date,
      granted_today: Number(grant.r_granted ?? 0),
      remaining_today: remainingToday,
      newly_granted: Boolean(grant.r_newly_granted),
      pool_balance: poolBalance,
      total_spendable: remainingToday + poolBalance,
      released: {
        count: release ? Number(release.r_released_count ?? 0) : 0,
        usdc: release ? Number(release.r_released_usdc ?? 0) : 0,
      },
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/startup-votes/balance] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
