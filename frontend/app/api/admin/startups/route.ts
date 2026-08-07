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
      .from('startup_startups')
      .select(
        'id, name, slug, description, pitch, website, twitter, logo_url, stage, phase, vote_threshold, capital_target, total_yes_votes, total_no_votes, deleted_at, created_at, owner_id'
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/admin/startups] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err: any) {
    console.error('[api/admin/startups] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
