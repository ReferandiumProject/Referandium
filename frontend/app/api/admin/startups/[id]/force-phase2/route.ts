import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

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

  if (lower.includes('not found')) {
    return NextResponse.json({ error: message }, { status: 404 })
  }
  if (
    lower.includes('already deleted') ||
    lower.includes('not deleted') ||
    lower.includes('only phase 1') ||
    lower.includes('not in phase 1') ||
    lower.includes('can only be changed in phase 1')
  ) {
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
  let reason = ''
  try {
    const body = await request.json().catch(() => ({}))
    reason = body?.reason ?? ''
  } catch {
    reason = ''
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('admin_force_phase2', {
      p_admin_user_id: admin.id,
      p_startup_id: id,
      p_reason: reason,
    })

    if (error) {
      return handleRpcError('admin_force_phase2', error)
    }

    const result = Array.isArray(data) ? data[0] : data
    return NextResponse.json(result || { ok: true })
  } catch (err: any) {
    console.error('[api/admin/startups/force-phase2] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
