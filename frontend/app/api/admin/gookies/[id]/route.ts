import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const gookieId = params.id
  if (!gookieId) {
    return NextResponse.json({ error: 'Missing gookie id' }, { status: 400 })
  }

  const { status } = await request.json().catch(() => ({})) as { status?: string }
  if (!status) {
    return NextResponse.json({ error: 'Missing status' }, { status: 400 })
  }

  const { data: gookie, error } = await supabaseAdmin
    .from('gookies')
    .update({ status })
    .eq('id', gookieId)
    .select('*')
    .single()

  if (error) {
    console.error('[admin/gookies/[id] PATCH] update error:', error)
    return NextResponse.json({ error: 'Failed to update gookie' }, { status: 500 })
  }

  if (!gookie) {
    return NextResponse.json({ error: 'Gookie not found' }, { status: 404 })
  }

  return NextResponse.json({ gookie })
}
