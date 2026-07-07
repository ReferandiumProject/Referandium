import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  console.log('[api/signal] received request')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/signal] authenticated user:', user.id)
    } catch (err) {
      console.log('[api/signal] unauthorized:', err)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[api/signal] parsed body:', body)

    const { market_id, signal_direction, usdc_amount } = body

    if (!market_id) {
      console.log('[api/signal] missing market_id')
      return NextResponse.json({ error: 'market_id is required' }, { status: 400 })
    }

    if (!signal_direction || (signal_direction !== 'yes' && signal_direction !== 'no')) {
      console.log('[api/signal] invalid signal_direction')
      return NextResponse.json({ error: 'signal_direction must be "yes" or "no"' }, { status: 400 })
    }

    if (!usdc_amount || typeof usdc_amount !== 'number' || usdc_amount < 5) {
      console.log('[api/signal] invalid usdc_amount')
      return NextResponse.json({ error: 'usdc_amount must be at least 5' }, { status: 400 })
    }

    console.log('[api/signal] fetching balance for user:', user.id)
    const { data: balance, error: balanceError } = await supabaseAdmin
      .from('balances')
      .select('available_usdc, locked_usdc')
      .eq('user_id', user.id)
      .single()

    if (balanceError || !balance) {
      console.log('[api/signal] balance fetch failed:', balanceError)
      return NextResponse.json({ error: 'Unable to fetch balance' }, { status: 400 })
    }

    console.log('[api/signal] available_usdc:', balance.available_usdc)
    if (balance.available_usdc < usdc_amount) {
      console.log('[api/signal] insufficient balance')
      return NextResponse.json({ error: 'Insufficient available USDC' }, { status: 400 })
    }

    console.log('[api/signal] checking existing signal for market:', market_id, 'wallet:', user.wallet_address)
    const { data: existingSignal, error: existingSignalError } = await supabaseAdmin
      .from('signals')
      .select('id')
      .eq('market_id', market_id)
      .eq('user_wallet', user.wallet_address)
      .maybeSingle()

    if (existingSignalError) {
      console.log('[api/signal] existing signal check failed:', existingSignalError)
      return NextResponse.json({ error: 'Unable to verify existing signal' }, { status: 400 })
    }

    if (existingSignal) {
      console.log('[api/signal] user already signaled on this market')
      return NextResponse.json({ error: 'You have already signalled on this market' }, { status: 400 })
    }

    console.log('[api/signal] deducting balance')
    const { error: updateBalanceError } = await supabaseAdmin
      .from('balances')
      .update({
        available_usdc: balance.available_usdc - usdc_amount,
        locked_usdc: balance.locked_usdc + usdc_amount,
      })
      .eq('user_id', user.id)

    if (updateBalanceError) {
      console.error('[api/signal] balance update failed:', updateBalanceError)
      throw updateBalanceError
    }

    console.log('[api/signal] inserting signal row')
    const { error: insertSignalError } = await supabaseAdmin
      .from('signals')
      .insert({
        market_id,
        user_wallet: user.wallet_address,
        signal_direction,
        usdc_amount,
      })

    if (insertSignalError) {
      console.error('[api/signal] signal insert failed:', insertSignalError)
      throw insertSignalError
    }

    console.log('[api/signal] fetching current market totals')
    const { data: market, error: marketFetchError } = await supabaseAdmin
      .from('markets')
      .select('total_usdc_locked, total_signals')
      .eq('id', market_id)
      .single()

    if (marketFetchError || !market) {
      console.error('[api/signal] market fetch failed:', marketFetchError)
      throw marketFetchError || new Error('Market not found')
    }

    console.log('[api/signal] incrementing market totals')
    const { error: marketUpdateError } = await supabaseAdmin
      .from('markets')
      .update({
        total_usdc_locked: market.total_usdc_locked + usdc_amount,
        total_signals: market.total_signals + 1,
      })
      .eq('id', market_id)

    if (marketUpdateError) {
      console.error('[api/signal] market update failed:', marketUpdateError)
      throw marketUpdateError
    }

    console.log('[api/signal] signal recorded successfully')
    return NextResponse.json({ success: true, signal_direction, usdc_amount })
  } catch (error: any) {
    console.error('[api/signal] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
