import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000

function handleAuthError(err: any) {
  if (err?.message === 'Forbidden' || err?.message === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
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
    const { data: latest, error: latestError } = await supabaseAdmin
      .from('integrity_check_results')
      .select('ran_at')
      .order('ran_at', { ascending: false })
      .limit(1)
      .single()

    if (latestError) {
      console.error('[api/admin/integrity-checks] latest run query error:', latestError)
      return NextResponse.json({ error: latestError.message }, { status: 500 })
    }

    if (!latest) {
      return NextResponse.json({
        ran_at: null,
        stale: true,
        stale_for: 'never',
        overall: 'warn',
        checks: [],
      })
    }

    const { data: checks, error: checksError } = await supabaseAdmin
      .from('integrity_check_results')
      .select('check_name, status, value, detail')
      .eq('ran_at', latest.ran_at)
      .order('check_name', { ascending: true })

    if (checksError) {
      console.error('[api/admin/integrity-checks] checks query error:', checksError)
      return NextResponse.json({ error: checksError.message }, { status: 500 })
    }

    const ranAtMs = new Date(latest.ran_at).getTime()
    const nowMs = Date.now()
    const staleMs = nowMs - ranAtMs
    const stale = staleMs > STALE_THRESHOLD_MS

    const anyFail = (checks ?? []).some((c: any) => c.status === 'fail')
    const anyWarn = (checks ?? []).some((c: any) => c.status === 'warn')

    let overall: 'ok' | 'warn' | 'fail' = 'ok'
    if (anyFail) {
      overall = 'fail'
    } else if (stale || anyWarn) {
      overall = 'warn'
    }

    return NextResponse.json({
      ran_at: latest.ran_at,
      stale,
      stale_for: stale ? formatDuration(staleMs) : null,
      overall,
      checks: checks ?? [],
    })
  } catch (err: any) {
    console.error('[api/admin/integrity-checks] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
