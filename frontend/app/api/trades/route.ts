import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getBuyCost, getSellProceeds, getPrice } from '@/lib/lmsr'

const FEE_RATE = 0.005 // 0.5% trading fee; easy to adjust later.

export const runtime = 'nodejs'

interface TradeBody {
  market_id: string
  option_id: string
  type: 'buy' | 'sell'
  shares: number
}

export async function POST(request: NextRequest) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: TradeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { market_id, option_id, type, shares } = body

  if (!market_id || typeof market_id !== 'string') {
    return NextResponse.json({ error: 'market_id is required' }, { status: 400 })
  }
  if (!option_id || typeof option_id !== 'string') {
    return NextResponse.json({ error: 'option_id is required' }, { status: 400 })
  }
  if (type !== 'buy' && type !== 'sell') {
    return NextResponse.json({ error: "type must be 'buy' or 'sell'" }, { status: 400 })
  }
  if (typeof shares !== 'number' || !Number.isFinite(shares) || shares <= 0) {
    return NextResponse.json({ error: 'shares must be a positive number' }, { status: 400 })
  }

  // Fetch and validate market.
  const { data: market, error: marketError } = await supabaseAdmin
    .from('markets')
    .select('id, status, end_date')
    .eq('id', market_id)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  if (market.status !== 'active') {
    return NextResponse.json({ error: 'Market is not active' }, { status: 400 })
  }

  const marketEnd = new Date(market.end_date as string)
  if (Number.isNaN(marketEnd.getTime()) || marketEnd.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Market has ended or end date is invalid' }, { status: 400 })
  }

  // Fetch the traded option and the opposite option.
  const { data: tradedOption, error: tradedOptionError } = await supabaseAdmin
    .from('market_options')
    .select('id, market_id, label, shares_outstanding')
    .eq('id', option_id)
    .eq('market_id', market_id)
    .single()

  if (tradedOptionError || !tradedOption) {
    return NextResponse.json({ error: 'Option not found for this market' }, { status: 400 })
  }

  if (tradedOption.label !== 'YES' && tradedOption.label !== 'NO') {
    return NextResponse.json({ error: 'Invalid option label' }, { status: 400 })
  }

  const { data: otherOptions, error: otherOptionsError } = await supabaseAdmin
    .from('market_options')
    .select('label, shares_outstanding')
    .eq('market_id', market_id)
    .neq('id', option_id)

  if (otherOptionsError || !otherOptions || otherOptions.length !== 1) {
    return NextResponse.json({ error: 'Could not load opposite option' }, { status: 500 })
  }

  const otherOption = otherOptions[0]
  const otherLabel = otherOption.label === 'YES' ? 'YES' : 'NO'

  const qYes =
    tradedOption.label === 'YES'
      ? Number(tradedOption.shares_outstanding)
      : Number(otherOption.shares_outstanding)
  const qNo =
    tradedOption.label === 'YES'
      ? Number(otherOption.shares_outstanding)
      : Number(tradedOption.shares_outstanding)

  const optionLabel = tradedOption.label as 'YES' | 'NO'

  // Compute trade cost/proceeds and fee.
  let grossUsdc: number
  if (type === 'buy') {
    grossUsdc = getBuyCost(qYes, qNo, optionLabel, shares)
  } else {
    grossUsdc = getSellProceeds(qYes, qNo, optionLabel, shares)
  }

  if (grossUsdc < 0 || !Number.isFinite(grossUsdc)) {
    return NextResponse.json({ error: 'Trade calculation produced an invalid amount' }, { status: 500 })
  }

  const fee = grossUsdc * FEE_RATE
  const price = shares === 0 ? 0 : grossUsdc / shares

  // Fetch user balance.
  const { data: balance, error: balanceError } = await supabaseAdmin
    .from('balances')
    .select('id, available_usdc')
    .eq('user_id', user.id)
    .single()

  if (balanceError || !balance) {
    return NextResponse.json({ error: 'Balance not found' }, { status: 400 })
  }

  const available = Number(balance.available_usdc)

  // For sells, verify the user owns enough shares.
  let position: { id: string; shares: number; avg_price: number } | null = null
  if (type === 'sell') {
    const { data: pos, error: posError } = await supabaseAdmin
      .from('positions')
      .select('id, shares, avg_price')
      .eq('user_id', user.id)
      .eq('option_id', option_id)
      .single()

    if (posError || !pos || Number(pos.shares) < shares) {
      return NextResponse.json({ error: 'Insufficient shares to sell' }, { status: 400 })
    }

    position = pos as { id: string; shares: number; avg_price: number }
  }

  // Check buy affordability.
  if (type === 'buy') {
    const totalCost = grossUsdc + fee
    if (available < totalCost) {
      return NextResponse.json({ error: 'Insufficient USDC balance' }, { status: 400 })
    }
  }

  // Update outstanding shares.
  const currentOutstanding = Number(tradedOption.shares_outstanding)
  const newOutstanding =
    type === 'buy' ? currentOutstanding + shares : currentOutstanding - shares

  if (newOutstanding < 0) {
    return NextResponse.json({ error: 'Insufficient market liquidity' }, { status: 400 })
  }

  const { error: updateOptionError } = await supabaseAdmin
    .from('market_options')
    .update({ shares_outstanding: newOutstanding })
    .eq('id', option_id)

  if (updateOptionError) {
    return NextResponse.json({ error: 'Failed to update option shares' }, { status: 500 })
  }

  // Update user balance.
  const newAvailable =
    type === 'buy' ? available - (grossUsdc + fee) : available + (grossUsdc - fee)

  const { data: updatedBalance, error: updateBalanceError } = await supabaseAdmin
    .from('balances')
    .update({ available_usdc: newAvailable })
    .eq('id', balance.id)
    .select('available_usdc')
    .single()

  if (updateBalanceError || !updatedBalance) {
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }

  // Record the trade.
  const tradeInsert = {
    user_id: user.id,
    market_id,
    option_id,
    type,
    shares,
    price,
    usdc_amount: grossUsdc,
    fee,
  } as any

  const { data: trade, error: tradeError } = await supabaseAdmin
    .from('trades')
    .insert(tradeInsert)
    .select('*')
    .single()

  if (tradeError || !trade) {
    return NextResponse.json({ error: 'Failed to record trade' }, { status: 500 })
  }

  // Upsert position.
  const { data: existingPosition, error: existingPositionError } = await supabaseAdmin
    .from('positions')
    .select('id, shares, avg_price')
    .eq('user_id', user.id)
    .eq('option_id', option_id)
    .maybeSingle()

  if (existingPositionError) {
    return NextResponse.json({ error: 'Failed to fetch position' }, { status: 500 })
  }

  if (type === 'buy') {
    const oldShares = existingPosition ? Number(existingPosition.shares) : 0
    const oldAvg = existingPosition ? Number(existingPosition.avg_price) : 0
    const totalShares = oldShares + shares
    const totalCostBasis = oldShares * oldAvg + grossUsdc
    const newAvgPrice = totalShares === 0 ? 0 : totalCostBasis / totalShares

    if (existingPosition) {
      const { error: positionUpdateError } = await supabaseAdmin
        .from('positions')
        .update({ shares: totalShares, avg_price: newAvgPrice })
        .eq('id', existingPosition.id)

      if (positionUpdateError) {
        return NextResponse.json({ error: 'Failed to update position' }, { status: 500 })
      }
    } else {
      const { error: positionInsertError } = await supabaseAdmin.from('positions').insert({
        user_id: user.id,
        market_id,
        option_id,
        shares: totalShares,
        avg_price: newAvgPrice,
      } as any)

      if (positionInsertError) {
        return NextResponse.json({ error: 'Failed to create position' }, { status: 500 })
      }
    }
  } else {
    // Sell: decrease shares. Delete the row if all shares are sold.
    const oldShares = Number(position?.shares || 0)
    const newPosShares = oldShares - shares

    if (newPosShares <= 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('positions')
        .delete()
        .eq('id', (position as { id: string }).id)

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete position' }, { status: 500 })
      }
    } else {
      const { error: positionUpdateError } = await supabaseAdmin
        .from('positions')
        .update({ shares: newPosShares })
        .eq('id', (position as { id: string }).id)

      if (positionUpdateError) {
        return NextResponse.json({ error: 'Failed to update position' }, { status: 500 })
      }
    }
  }

  // Compute the updated price for the traded option.
  const updatedQYes =
    tradedOption.label === 'YES' ? newOutstanding : Number(otherOption.shares_outstanding)
  const updatedQNo =
    tradedOption.label === 'YES' ? Number(otherOption.shares_outstanding) : newOutstanding
  const updatedPrice = getPrice(updatedQYes, updatedQNo, optionLabel)

  return NextResponse.json({
    updatedPrice,
    newBalance: Number(updatedBalance.available_usdc),
    trade,
  })
}
