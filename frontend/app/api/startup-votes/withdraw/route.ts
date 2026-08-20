import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { checkRateLimit } from '@/lib/rate-limit'

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

    if (!startupId || typeof startupId !== 'string' || !UUID_REGEX.test(startupId)) {
      return NextResponse.json({ error: 'Missing or invalid startup_id (must be a UUID)' }, { status: 400 })
    }

    if (!Number.isInteger(votes) || votes <= 0) {
      return NextResponse.json({ error: 'votes must be a positive integer' }, { status: 400 })
    }

    const { data: withdrawData, error: withdrawError } = await supabaseAdmin.rpc('withdraw_vote', {
      p_user_id: user.id,
      p_startup_id: startupId,
      p_votes: votes,
    })

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

      return NextResponse.json({ error: msg || 'Failed to withdraw votes' }, { status: 500 })
    }

    const result = Array.isArray(withdrawData) ? withdrawData[0] : withdrawData

    if (!result) {
      console.error('[api/startup-votes/withdraw] withdraw_vote returned no data')
      return NextResponse.json({ error: 'Failed to withdraw votes' }, { status: 500 })
    }

    return NextResponse.json({
      withdrawn: Number(result.withdrawn ?? 0),
      still_deployed: Number(result.still_deployed ?? 0),
      pool_available: Number(result.pool_available ?? 0),
      net_votes: Number(result.net_votes ?? 0),
      phase_closed: Boolean(result.phase_closed),
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/startup-votes/withdraw] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
