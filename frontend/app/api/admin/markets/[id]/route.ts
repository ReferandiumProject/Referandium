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

  const marketId = params.id
  if (!marketId) {
    return NextResponse.json({ error: 'Missing market id' }, { status: 400 })
  }

  const { status } = await request.json().catch(() => ({})) as { status?: string }
  if (!status || !['active', 'cancelled'].includes(status)) {
    return NextResponse.json(
      { error: 'Invalid status. Use active or cancelled' },
      { status: 400 }
    )
  }

  const { data: market, error } = await supabaseAdmin
    .from('markets')
    .update({ status })
    .eq('id', marketId)
    .select('*')
    .single()

  if (error) {
    console.error('[admin/markets/[id] PATCH] update error:', error)
    return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
  }

  if (!market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  return NextResponse.json({ market })
}
