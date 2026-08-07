import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_AMOUNT_REGEX = /^\d+(\.\d{1,18})?$/

function mapRpcError(error: { message?: string }): { status: number; message: string } {
  const msg = (error.message ?? '').toLowerCase()

  if (msg.includes('insufficient balance') || msg.includes('no balance found')) {
    return { status: 402, message: error.message ?? 'Insufficient balance' }
  }
  if (
    msg.includes('minimum purchase') ||
    msg.includes('not enough tokens') ||
    msg.includes('must be positive') ||
    msg.includes('too small')
  ) {
    return { status: 400, message: error.message ?? 'Invalid amount' }
  }
  if (
    msg.includes('not raising capital') ||
    msg.includes('already completed') ||
    msg.includes('temporarily halted')
  ) {
    return { status: 409, message: error.message ?? 'Trading not allowed' }
  }
  if (msg.includes('startup not found') || msg.includes('no curve open')) {
    return { status: 404, message: error.message ?? 'Not found' }
  }

  return { status: 500, message: error.message ?? 'Internal server error' }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const startupId = body?.startup_id
    const tokens = body?.tokens

    if (!startupId || typeof startupId !== 'string' || !UUID_REGEX.test(startupId)) {
      return NextResponse.json(
        { error: 'Missing or invalid startup_id (must be a UUID)' },
        { status: 400 }
      )
    }

    if (typeof tokens !== 'string' || !TOKEN_AMOUNT_REGEX.test(tokens) || Number(tokens) <= 0) {
      return NextResponse.json(
        { error: 'tokens must be a positive numeric string with at most 18 decimal places' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin.rpc('sell_curve_tokens', {
      p_user_id: user.id,
      p_startup_id: startupId,
      p_tokens: tokens,
    })

    if (error) {
      const mapped = mapRpcError(error)
      if (mapped.status === 500) {
        console.error('[api/curve/sell] sell_curve_tokens error:', error)
      }
      return NextResponse.json({ error: mapped.message }, { status: mapped.status })
    }

    const result = Array.isArray(data) ? data[0] : data
    if (!result) {
      console.error('[api/curve/sell] sell_curve_tokens returned no data')
      return NextResponse.json({ error: 'Failed to sell curve tokens' }, { status: 500 })
    }

    return NextResponse.json({
      r_tokens_sold: String(result.r_tokens_sold),
      r_usdc_gross: String(result.r_usdc_gross),
      r_fee: String(result.r_fee),
      r_usdc_net: String(result.r_usdc_net),
      r_tokens_left: String(result.r_tokens_left),
      r_pool_usdc: String(result.r_pool_usdc),
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/curve/sell] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
