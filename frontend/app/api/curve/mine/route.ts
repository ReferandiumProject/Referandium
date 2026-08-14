import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const { data: holdings, error: holdingsError } = await supabaseAdmin
      .from('startup_holdings')
      .select(
        `
        startup_id,
        tokens::text,
        cost_basis::text,
        startup_startups!inner (
          name,
          slug,
          logo_url,
          phase,
          deleted_at,
          startup_curve_state!inner (
            pool_usdc::text,
            price::text,
            capital_target::text,
            progress,
            graduated_at,
            frozen_at
          )
        )
      `
      )
      .eq('user_id', user.id)
      .gt('tokens', 0)
      .is('startup_startups.deleted_at', null)

    if (holdingsError) {
      console.error('[api/curve/mine] holdings query error:', holdingsError)
      return NextResponse.json(
        { error: holdingsError.message || 'Failed to load holdings' },
        { status: 500 }
      )
    }

    const { data: releaseData, error: releaseError } = await supabaseAdmin.rpc(
      'release_due_investment_packs',
      { p_user_id: user.id }
    )

    if (releaseError) {
      console.error('[api/curve/mine] release_due_investment_packs error:', releaseError)
    }

    const release = Array.isArray(releaseData) ? releaseData[0] : releaseData

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from('balances')
      .select('available_usdc::text')
      .eq('user_id', user.id)
      .maybeSingle()

    if (balanceError) {
      console.error('[api/curve/mine] balance query error:', balanceError)
      return NextResponse.json(
        { error: balanceError.message || 'Failed to load balance' },
        { status: 500 }
      )
    }

    const items = (holdings ?? []).map((row: any) => {
      const startup = row.startup_startups
      const curve = startup?.startup_curve_state
      const tokens = String(row.tokens ?? 0)
      const price = String(curve?.price ?? 0)

      let spotValueEstimate = tokens
      try {
        spotValueEstimate = Decimal.parse(tokens)
          .mul(Decimal.parse(price), 18)
          .toString()
      } catch {
        // Fallback to the raw token string if multiplication fails.
      }

      return {
        startup_id: row.startup_id,
        name: startup?.name ?? null,
        slug: startup?.slug ?? null,
        logo_url: startup?.logo_url ?? null,
        phase: startup?.phase ?? 1,
        tokens,
        cost_basis: String(row.cost_basis ?? 0),
        current_price: price,
        pool_usdc: String(curve?.pool_usdc ?? 0),
        capital_target: String(curve?.capital_target ?? 0),
        progress: Number(curve?.progress ?? 0),
        graduated: Boolean(curve?.graduated_at),
        frozen: Boolean(curve?.frozen_at),
        spot_value_estimate: spotValueEstimate,
      }
    })

    return NextResponse.json({
      holdings: items,
      available_usdc: balance?.available_usdc ? String(balance.available_usdc) : '0',
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
    console.error('[api/curve/mine] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
