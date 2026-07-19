import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  console.log('[admin/markets] ADMIN_EMAILS env:', process.env.ADMIN_EMAILS)
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[admin/markets] user.email:', user.email)
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: markets, error } = await supabaseAdmin
    .from('markets')
    .select('id, title, status, category, end_date')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load markets' },
      { status: 500 }
    )
  }

  return NextResponse.json({ markets: markets || [] })
}
