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

export async function GET(request: Request) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('admin_actions')
      .select('id, admin_user_id, action, startup_id, details, created_at, users!inner(email)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[api/admin/actions] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results = (data || []).map((row: any) => ({
      id: row.id,
      action: row.action,
      admin_id: row.admin_user_id,
      startup_id: row.startup_id,
      details: row.details,
      created_at: row.created_at,
      admin_email: row.users?.email ?? null,
    }))

    return NextResponse.json(results)
  } catch (err: any) {
    console.error('[api/admin/actions] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
