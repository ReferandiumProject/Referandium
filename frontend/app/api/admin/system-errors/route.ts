import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    const status = err?.status ?? (err?.message === 'Forbidden' ? 403 : 401)
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status })
  }

  const { data, error } = await supabaseAdmin
    .from('system_errors')
    .select(
      'id, fingerprint, source, name, message, stack, path, user_id, context, occurrences, first_seen, last_seen, resolved_at'
    )
    .is('resolved_at', null)
    .order('last_seen', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
