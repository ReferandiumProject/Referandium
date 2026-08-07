import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    const direction = body?.direction
    const votes = body?.votes

    if (!startupId || typeof startupId !== 'string' || !UUID_REGEX.test(startupId)) {
      return NextResponse.json({ error: 'Missing or invalid startup_id (must be a UUID)' }, { status: 400 })
    }

    if (direction !== 'yes' && direction !== 'no') {
      return NextResponse.json({ error: 'direction must be "yes" or "no"' }, { status: 400 })
    }

    if (!Number.isInteger(votes) || votes <= 0) {
      return NextResponse.json({ error: 'votes must be a positive integer' }, { status: 400 })
    }

    const { data: castData, error: castError } = await supabaseAdmin.rpc('cast_vote', {
      p_user_id: user.id,
      p_startup_id: startupId,
      p_direction: direction,
      p_votes: votes,
    })

    if (castError) {
      const msg = castError.message || ''
      console.error('[api/startup-votes/cast] cast_vote error:', castError)

      if (msg.includes('already hold')) {
        return NextResponse.json({ error: msg }, { status: 409 })
      }
      if (msg.includes('Not enough votes')) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      if (msg.includes('Voting is closed')) {
        return NextResponse.json({ error: msg }, { status: 409 })
      }
      if (msg.includes('Startup not found')) {
        return NextResponse.json({ error: msg }, { status: 404 })
      }

      return NextResponse.json({ error: msg || 'Failed to cast vote' }, { status: 500 })
    }

    const result = Array.isArray(castData) ? castData[0] : castData

    if (!result) {
      console.error('[api/startup-votes/cast] cast_vote returned no data')
      return NextResponse.json({ error: 'Failed to cast vote' }, { status: 500 })
    }

    return NextResponse.json({
      deployed: Number(result.deployed ?? 0),
      from_grant: Number(result.from_grant ?? 0),
      from_pool: Number(result.from_pool ?? 0),
      net_votes: Number(result.net_votes ?? 0),
      phase_closed: Boolean(result.phase_closed),
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/startup-votes/cast] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
