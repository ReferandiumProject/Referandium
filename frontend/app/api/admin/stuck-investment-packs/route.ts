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

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export async function GET(request: Request) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('stuck_investment_packs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/admin/stuck-investment-packs] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const now = Date.now()
    const result = (data ?? []).map((row: any) => {
      const stuckAt = row.stuck_at ?? row.updated_at ?? row.created_at
      const stuckMs = now - new Date(stuckAt).getTime()
      return {
        id: row.id,
        email: row.email,
        amount_charged: row.amount_charged,
        created_at: row.created_at,
        stuck_for: formatDuration(stuckMs),
        stuck_seconds: Math.floor(stuckMs / 1000),
      }
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[api/admin/stuck-investment-packs] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
