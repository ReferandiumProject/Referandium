import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { isAdmin } from '@/lib/admin'

export const runtime = 'nodejs'

const RESOLUTION_FEE_RATE = 0.02 // 2% fee on winner payouts.

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth.
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing market id' }, { status: 400 })
  }

  // Body.
  let body: { outcome?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { outcome } = body
  if (outcome !== 'YES' && outcome !== 'NO') {
    return NextResponse.json({ error: "outcome must be 'YES' or 'NO'" }, { status: 400 })
  }

  // Market.
  const { data: market, error: marketError } = await supabaseAdmin
    .from('markets')
    .select('id, status, creator_id, creator_type')
    .eq('id', id)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  if (market.status !== 'active') {
    return NextResponse.json(
      { error: 'Market is already resolved or not active' },
      { status: 400 }
    )
  }

  // Options.
  const { data: options, error: optionsError } = await supabaseAdmin
    .from('market_options')
    .select('id, label')
    .eq('market_id', id)

  if (optionsError || !options || options.length !== 2) {
    return NextResponse.json({ error: 'Failed to load market options' }, { status: 500 })
  }

  const winningOption = options.find((o: any) => o.label === outcome)
  if (!winningOption) {
    return NextResponse.json({ error: 'Winning option not found' }, { status: 500 })
  }

  const winningOptionId = winningOption.id
  const isGookie = market.creator_type === 'gookie'

  // Positions with shares > 0 on this market.
  const { data: positions, error: positionsError } = await supabaseAdmin
    .from('positions')
    .select('id, user_id, option_id, shares')
    .eq('market_id', id)
    .gt('shares', 0)

  if (positionsError || !positions) {
    return NextResponse.json({ error: 'Failed to load positions' }, { status: 500 })
  }

  const winners = positions.filter((p: any) => p.option_id === winningOptionId)

  // Preload relevant balances so we can update by id.
  const userIds = new Set<string>(winners.map((p: any) => p.user_id))
  if (isGookie && market.creator_id) {
    userIds.add(market.creator_id as string)
  }

  const { data: balances, error: balancesError } = await supabaseAdmin
    .from('balances')
    .select('id, user_id, available_usdc')
    .in('user_id', Array.from(userIds))

  if (balancesError) {
    return NextResponse.json({ error: 'Failed to load balances' }, { status: 500 })
  }

  const balanceByUserId = new Map<string, any>(
    (balances || []).map((b: any) => [b.user_id, b])
  )

  let totalPaidOut = 0
  let totalFees = 0
  let platformFees = 0
  let gookieFees = 0
  let positionsSettled = 0

  for (const pos of winners) {
    const shares = Number(pos.shares)
    if (!Number.isFinite(shares) || shares <= 0) continue

    const payout = shares * 1.0
    const fee = payout * RESOLUTION_FEE_RATE
    const net = payout - fee

    const balance = balanceByUserId.get(pos.user_id)
    if (!balance) {
      return NextResponse.json(
        { error: `Balance not found for user ${pos.user_id}` },
        { status: 500 }
      )
    }

    const newAvailable = Number(balance.available_usdc) + net
    const { error: updateError } = await supabaseAdmin
      .from('balances')
      .update({ available_usdc: newAvailable })
      .eq('id', balance.id)

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to credit user ${pos.user_id}` },
        { status: 500 }
      )
    }

    totalPaidOut += net
    totalFees += fee
    positionsSettled += 1

    if (isGookie) {
      const gookieFee = fee * 0.25
      const platformFee = fee - gookieFee
      gookieFees += gookieFee
      platformFees += platformFee
    } else {
      platformFees += fee
    }
  }

  // Credit gookie fee to the market creator if applicable.
  if (isGookie && market.creator_id && gookieFees > 0) {
    const creatorBalance = balanceByUserId.get(market.creator_id as string)
    if (!creatorBalance) {
      return NextResponse.json(
        { error: 'Creator balance not found' },
        { status: 500 }
      )
    }

    const newCreatorAvailable = Number(creatorBalance.available_usdc) + gookieFees
    const { error: creatorUpdateError } = await supabaseAdmin
      .from('balances')
      .update({ available_usdc: newCreatorAvailable })
      .eq('id', creatorBalance.id)

    if (creatorUpdateError) {
      return NextResponse.json(
        { error: 'Failed to credit gookie creator' },
        { status: 500 }
      )
    }
  }

  // Resolve the market.
  const { error: resolveError } = await supabaseAdmin
    .from('markets')
    .update({ status: 'resolved', outcome })
    .eq('id', id)

  if (resolveError) {
    return NextResponse.json({ error: 'Failed to resolve market' }, { status: 500 })
  }

  return NextResponse.json({
    market_id: id,
    outcome,
    total_paid_out: totalPaidOut,
    positions_settled: positionsSettled,
    total_fees: totalFees,
    platform_fees: platformFees,
    gookie_fees: gookieFees,
  })
}
