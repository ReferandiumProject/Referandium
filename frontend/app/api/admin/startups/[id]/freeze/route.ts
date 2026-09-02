import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { notifyRaiseFrozen } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function handleAuthError(err: any) {
  if (err?.message === 'Forbidden' || err?.message === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function handleRpcError(label: string, err: any) {
  const message = err?.message || ''
  const lower = message.toLowerCase()
  console.error(`[api/admin/startups] ${label} RPC error:`, err)

  if (lower.includes('no curve open for this startup')) {
    return NextResponse.json({ error: message }, { status: 404 })
  }
  if (lower.includes('already completed')) {
    return NextResponse.json({ error: message }, { status: 409 })
  }

  return NextResponse.json({ error: message || 'Internal server error' }, { status: 500 })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let admin
  try {
    admin = await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  const { id } = params
  let frozen: boolean
  let reason = ''
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body?.frozen !== 'boolean') {
      return NextResponse.json({ error: 'frozen must be a boolean' }, { status: 400 })
    }
    frozen = body.frozen
    reason = body?.reason ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('admin_set_curve_frozen', {
      p_admin_user_id: admin.id,
      p_startup_id: id,
      p_frozen: frozen,
      p_reason: reason,
    })

    if (error) {
      return handleRpcError('admin_set_curve_frozen', error)
    }

    if (frozen) {
      void notifyRaiseFrozen(id)
    }

    const result = Array.isArray(data) ? data[0] : data
    return NextResponse.json(result ?? { ok: true })
  } catch (err: any) {
    console.error('[api/admin/startups/freeze] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
