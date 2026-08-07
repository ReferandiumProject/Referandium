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

    if (!startupId || typeof startupId !== 'string' || !UUID_REGEX.test(startupId)) {
      return NextResponse.json({ error: 'Missing or invalid startup_id (must be a UUID)' }, { status: 400 })
    }

    const { data: flipData, error: flipError } = await supabaseAdmin.rpc('flip_vote', {
      p_user_id: user.id,
      p_startup_id: startupId,
    })

    if (flipError) {
      const msg = flipError.message || ''
      console.error('[api/startup-votes/flip] flip_vote error:', flipError)

      if (msg.includes('No votes deployed')) {
        return NextResponse.json({ error: msg }, { status: 404 })
      }
      if (msg.includes('Voting is closed')) {
        return NextResponse.json({ error: msg }, { status: 409 })
      }
      if (msg.includes('Startup not found')) {
        return NextResponse.json({ error: msg }, { status: 404 })
      }

      return NextResponse.json({ error: msg || 'Failed to flip vote' }, { status: 500 })
    }

    const result = Array.isArray(flipData) ? flipData[0] : flipData

    if (!result) {
      console.error('[api/startup-votes/flip] flip_vote returned no data')
      return NextResponse.json({ error: 'Failed to flip vote' }, { status: 500 })
    }

    return NextResponse.json({
      new_direction: result.r_new_direction,
      votes: Number(result.r_votes ?? 0),
      net_votes: Number(result.r_net_votes ?? 0),
      phase_closed: Boolean(result.r_phase_closed),
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/startup-votes/flip] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
