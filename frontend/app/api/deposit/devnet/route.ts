import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  console.log('[api/deposit/devnet] received request')

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
  const amount = typeof amount_usdc === 'string' ? parseFloat(amount_usdc) : Number(amount_usdc)

  if (!amount || amount <= 0 || Number.isNaN(amount)) {
    console.error('[api/deposit/devnet] invalid amount:', amount_usdc)
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }

  console.log(`[api/deposit/devnet] crediting ${amount} USDC to user:`, user.id)

  const { data: currentBalance, error: fetchError } = await supabaseAdmin
    .from('balances')
    .select('available_usdc')
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    console.error('[api/deposit/devnet] failed to fetch balance:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }

  const current = currentBalance?.available_usdc ?? 0
  const newBalance = Number(current) + amount

  const { error: updateError } = await supabaseAdmin
    .from('balances')
    .update({ available_usdc: newBalance })
    .eq('user_id', user.id)

  if (updateError) {
    console.error('[api/deposit/devnet] failed to update balance:', updateError)
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
  }

  console.log('[api/deposit/devnet] new balance:', newBalance)
  return NextResponse.json({ new_balance: newBalance }, { status: 200 })
}
