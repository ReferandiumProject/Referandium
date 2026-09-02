import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { checkRateLimit } from '@/lib/rate-limit'
import { errorResponse } from '@/lib/errorResponse'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const USDC_AMOUNT_REGEX = /^\d+(\.\d{1,6})?$/

function mapRpcError(error: { message?: string }): { status: number; message: string } {
  const msg = (error.message ?? '').toLowerCase()

  if (msg.includes('insufficient balance') || msg.includes('no balance found')) {
    return { status: 402, message: error.message ?? 'Insufficient balance' }
  }
  if (msg.includes('idempotency key mismatch')) {
    return { status: 409, message: error.message ?? 'idempotency key mismatch' }
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

    const rate = await checkRateLimit(user.id, 'curve-buy')
    if (!rate.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${rate.retryAfter} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const startupId = body?.startup_id
    const usdc = body?.usdc
    const idempotencyKey = body?.idempotency_key

    if (!startupId || typeof startupId !== 'string' || !UUID_REGEX.test(startupId)) {
      return NextResponse.json(
        { error: 'Missing or invalid startup_id (must be a UUID)' },
        { status: 400 }
      )
    }

    if (typeof usdc !== 'string' || !USDC_AMOUNT_REGEX.test(usdc) || Number(usdc) <= 0) {
      return NextResponse.json(
        { error: 'usdc must be a positive numeric string with at most 6 decimal places' },
        { status: 400 }
      )
    }

    if (
      idempotencyKey !== undefined &&
      idempotencyKey !== null &&
      (typeof idempotencyKey !== 'string' || !UUID_REGEX.test(idempotencyKey))
    ) {
      return NextResponse.json(
        { error: 'idempotency_key must be a UUID when provided' },
        { status: 400 }
      )
    }

    const rpcParams: any = {
      p_user_id: user.id,
      p_startup_id: startupId,
      p_usdc: usdc,
    }
    if (idempotencyKey) {
      rpcParams.p_idempotency_key = idempotencyKey
    }

    const { data, error } = await supabaseAdmin.rpc('buy_curve_tokens', rpcParams)

    if (error) {
      const mapped = mapRpcError(error)
      if (mapped.status === 500) {
        return errorResponse({
          status: 500,
          message: mapped.message,
          error,
          request,
        })
      }
      return NextResponse.json({ error: mapped.message }, { status: mapped.status })
    }

    const result = Array.isArray(data) ? data[0] : data
    if (!result) {
      return errorResponse({
        status: 500,
        message: 'Failed to buy curve tokens',
        error: 'buy_curve_tokens returned no data',
        request,
      })
    }

    return NextResponse.json({
      r_tokens: String(result.r_tokens),
      r_usdc_spent: String(result.r_usdc_spent),
      r_fee: String(result.r_fee),
      r_avg_price: String(result.r_avg_price),
      r_pool_usdc: String(result.r_pool_usdc),
      r_progress: Number(result.r_progress),
      r_graduated: Boolean(result.r_graduated),
      already_traded: Boolean(result.r_already_traded),
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return errorResponse({
      status: 500,
      message: message || 'Internal server error',
      error: err,
      request,
    })
  }
}
