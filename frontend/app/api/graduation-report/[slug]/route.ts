import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params

  try {
    const { data: startup, error: startupError } = await supabaseAdmin
      .from('startup_startups')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (startupError) {
      if (startupError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
      }
      console.error('[api/graduation-report/[slug]] startup query error:', startupError)
      return NextResponse.json({ error: startupError.message }, { status: 500 })
    }

    if (!startup) {
      return NextResponse.json({ error: 'Startup not found' }, { status: 404 })
    }

    const { data: graduation, error: gradError } = await supabaseAdmin
      .from('graduations')
      .select(
        `
        id,
        status,
        token_name,
        token_symbol,
        mint_address,
        total_supply::text,
        tokens_to_holders::text,
        tokens_to_lp::text,
        dust_to_lp::text,
        founder_usdc::text,
        founder_payout_signature,
        pool_address,
        lp_burn_signature,
        authority_revoke_signature,
        liquidity_usdc::text,
        lp_mint_address,
        lp_token_account,
        pool_price::text,
        pool_price_read_at
      `
      )
      .eq('startup_id', startup.id)
      .maybeSingle()

    if (gradError) {
      console.error('[api/graduation-report/[slug]] graduation query error:', gradError)
      return NextResponse.json({ error: gradError.message }, { status: 500 })
    }

    if (!graduation) {
      return NextResponse.json({ error: 'Graduation not found' }, { status: 404 })
    }

    const { data: curve, error: curveError } = await supabaseAdmin
      .from('startup_curve_state')
      .select('capital_target::text, price::text, pool_usdc::text')
      .eq('startup_id', startup.id)
      .maybeSingle()

    if (curveError) {
      console.error('[api/graduation-report/[slug]] curve state query error:', curveError)
      return NextResponse.json({ error: curveError.message }, { status: 500 })
    }

    const { data: holders, error: holdersError } = await supabaseAdmin
      .from('graduation_holders')
      .select('id, status')
      .eq('graduation_id', graduation.id)

    if (holdersError) {
      console.error('[api/graduation-report/[slug]] holders query error:', holdersError)
      return NextResponse.json({ error: holdersError.message }, { status: 500 })
    }

    const totalHolders = (holders ?? []).length
    const claimedCount = (holders ?? []).filter((h: any) => h.status === 'claimed').length
    const dustCount = (holders ?? []).filter((h: any) => h.status === 'dust_zero').length

    return NextResponse.json({
      token_name: graduation.token_name,
      token_symbol: graduation.token_symbol,
      status: graduation.status,
      mint_address: graduation.mint_address,
      total_supply: String(graduation.total_supply ?? 0),
      tokens_to_holders: String(graduation.tokens_to_holders ?? 0),
      tokens_to_lp: String(graduation.tokens_to_lp ?? 0),
      dust_to_lp: String(graduation.dust_to_lp ?? 0),
      founder_usdc: String(graduation.founder_usdc ?? 0),
      founder_payout_signature: graduation.founder_payout_signature,
      pool_address: graduation.pool_address,
      lp_burn_signature: graduation.lp_burn_signature,
      authority_revoke_signature: graduation.authority_revoke_signature,
      liquidity_usdc: String(graduation.liquidity_usdc ?? 0),
      lp_mint_address: graduation.lp_mint_address,
      lp_token_account: graduation.lp_token_account,
      pool_price: graduation.pool_price ? String(graduation.pool_price) : null,
      pool_price_read_at: graduation.pool_price_read_at,
      opening_pool_price: (() => {
        if (!graduation.pool_address) return null
        const liquidity = graduation.liquidity_usdc
        const tokens = graduation.tokens_to_lp
        if (!liquidity || !tokens) return null
        try {
          return Decimal.parse(String(liquidity))
            .div(Decimal.parse(String(tokens)), 18)
            .toString()
        } catch {
          return null
        }
      })(),
      capital_target: String(curve?.capital_target ?? 0),
      pool_usdc: String(curve?.pool_usdc ?? 0),
      final_price: String(curve?.price ?? 0),
      total_holders: totalHolders,
      claimed_count: claimedCount,
      dust_count: dustCount,
    })
  } catch (err: any) {
    console.error('[api/graduation-report/[slug]] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
