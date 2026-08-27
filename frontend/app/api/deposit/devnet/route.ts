import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'

const PER_REQUEST_CAP_USDC = Decimal.parse('1000')

// DEVNET / STAGING TESTING ONLY.
// The faucet mints off-chain USDC balance without a real deposit, which would
// be catastrophic in production. NEVER set DEVNET_FAUCET_ENABLED in
// production. Leaving the variable unset, empty, or anything other than "true"
// disables the faucet and is the safe default.
function isFaucetEnabled(): boolean {
  const raw = process.env.DEVNET_FAUCET_ENABLED
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'true'
}

function getDailyCapUsdc(): Decimal {
  const raw = process.env.DEVNET_FAUCET_DAILY_CAP_USDC
  if (!raw || raw.trim() === '') return Decimal.parse('5000')
  return Decimal.parse(raw.trim())
}

export async function POST(request: Request) {
  console.log('[api/deposit/devnet] received request')

  if (!isFaucetEnabled()) {
    console.error('[api/deposit/devnet] faucet requested but not enabled')
    return NextResponse.json({ error: 'Faucet is not enabled in this environment' }, { status: 403 })
  }

  let user
  try {
    user = await getAuthenticatedUser(request)
    console.log('[api/deposit/devnet] authenticated user:', user.id)
  } catch (error) {
    console.error('[api/deposit/devnet] authentication failed:', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch (error) {
    console.error('[api/deposit/devnet] invalid JSON body:', error)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { amount_usdc } = body
  if (typeof amount_usdc !== 'string' || amount_usdc.trim() === '') {
    console.error('[api/deposit/devnet] invalid amount type:', amount_usdc)
    return NextResponse.json({ error: 'Amount must be a string' }, { status: 400 })
  }

  let amount: Decimal
  try {
    amount = Decimal.parse(amount_usdc.trim())
  } catch {
    console.error('[api/deposit/devnet] invalid amount:', amount_usdc)
    return NextResponse.json({ error: 'Amount must be a valid number' }, { status: 400 })
  }

  if (amount.isZero() || amount.toString().startsWith('-')) {
    console.error('[api/deposit/devnet] non-positive amount:', amount_usdc)
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }

  if (amount.gt(PER_REQUEST_CAP_USDC)) {
    console.error('[api/deposit/devnet] amount exceeds per-request cap:', amount_usdc)
    return NextResponse.json(
      { error: `Amount exceeds per-request cap of ${PER_REQUEST_CAP_USDC.toString()} USDC` },
      { status: 400 }
    )
  }

  const dailyCap = getDailyCapUsdc()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: faucetToday, error: faucetSumError } = await supabaseAdmin
    .from('ledger_adjustments')
    .select('amount')
    .eq('user_id', user.id)
    .eq('reason', 'faucet')
    .gte('created_at', oneDayAgo)

  if (faucetSumError) {
    console.error('[api/deposit/devnet] failed to sum daily faucet usage:', faucetSumError)
    return NextResponse.json({ error: 'Failed to verify daily cap' }, { status: 500 })
  }

  const usedToday = (faucetToday ?? []).reduce((sum, row) => {
    return sum.add(Decimal.parse(String(row.amount)))
  }, Decimal.parse('0'))

  if (usedToday.add(amount).gt(dailyCap)) {
    console.error('[api/deposit/devnet] amount exceeds daily cap:', amount_usdc)
    return NextResponse.json(
      { error: `Amount exceeds daily faucet cap of ${dailyCap.toString()} USDC` },
      { status: 400 }
    )
  }

  console.log(`[api/deposit/devnet] crediting ${amount.toString()} USDC to user:`, user.id)

  const { error: grantError } = await supabaseAdmin.rpc('grant_unbacked_credit', {
    p_user_id: user.id,
    p_amount: amount.toString(),
    p_reason: 'faucet',
    p_note: 'Devnet faucet credit',
  })

  if (grantError) {
    console.error('[api/deposit/devnet] grant_unbacked_credit failed:', grantError)
    return NextResponse.json({ error: 'Failed to credit balance' }, { status: 500 })
  }

  const { data: newBalanceRow, error: fetchError } = await supabaseAdmin
    .from('balances')
    .select('available_usdc')
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    console.error('[api/deposit/devnet] failed to fetch new balance:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch new balance' }, { status: 500 })
  }

  const newBalance = Decimal.parse(String(newBalanceRow?.available_usdc ?? '0'))

  console.log('[api/deposit/devnet] new balance:', newBalance.toString())
  return NextResponse.json({ new_balance: Number(newBalance.toString()) }, { status: 200 })
}
