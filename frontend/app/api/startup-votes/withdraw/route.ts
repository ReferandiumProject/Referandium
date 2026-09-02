import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { checkRateLimit } from '@/lib/rate-limit'
import { errorResponse } from '@/lib/errorResponse'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const rate = await checkRateLimit(user.id, 'vote')
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
    const votes = body?.votes
    const idempotencyKey = body?.idempotency_key

    if (!startupId || typeof startupId !== 'string' || !UUID_REGEX.test(startupId)) {
      return NextResponse.json({ error: 'Missing or invalid startup_id (must be a UUID)' }, { status: 400 })
    }

    if (!Number.isInteger(votes) || votes <= 0) {
      return NextResponse.json({ error: 'votes must be a positive integer' }, { status: 400 })
    }

    if (
      idempotencyKey !== undefined &&
      idempotencyKey !== null &&
      (typeof idempotencyKey !== 'string' || !UUID_REGEX.test(idempotencyKey))
    ) {
      return NextResponse.json({ error: 'idempotency_key must be a UUID when provided' }, { status: 400 })
    }

    const rpcParams: any = {
      p_user_id: user.id,
      p_startup_id: startupId,
      p_votes: votes,
    }
    if (idempotencyKey) {
      rpcParams.p_idempotency_key = idempotencyKey
    }

    const { data: withdrawData, error: withdrawError } = await supabaseAdmin.rpc('withdraw_vote', rpcParams)

    if (withdrawError) {
      const msg = withdrawError.message || ''
      console.error('[api/startup-votes/withdraw] withdraw_vote error:', withdrawError)

      if (msg.includes('Not enough votes deployed')) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      if (msg.includes('must be positive')) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      if (msg.includes('Voting is closed')) {
        return NextResponse.json({ error: msg }, { status: 409 })
      }
      if (msg.includes('Startup not found')) {
        return NextResponse.json({ error: msg }, { status: 404 })
      }
      if (msg.includes('idempotency key mismatch')) {
        return NextResponse.json({ error: msg }, { status: 409 })
      }

      return errorResponse({
        status: 500,
        message: msg || 'Failed to withdraw votes',
        error: withdrawError,
        request,
      })
    }

    const result = Array.isArray(withdrawData) ? withdrawData[0] : withdrawData

    if (!result) {
      return errorResponse({
        status: 500,
        message: 'Failed to withdraw votes',
        error: 'withdraw_vote returned no data',
        request,
      })
    }

    return NextResponse.json({
      withdrawn: Number(result.withdrawn ?? 0),
      still_deployed: Number(result.still_deployed ?? 0),
      pool_available: Number(result.pool_available ?? 0),
      net_votes: Number(result.net_votes ?? 0),
      phase_closed: Boolean(result.phase_closed),
      already_withdrawn: Boolean(result.already_withdrawn),
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
