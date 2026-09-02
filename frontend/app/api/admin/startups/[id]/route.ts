import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { validateLogoUrl } from '@/lib/logo-storage'

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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let admin
  try {
    admin = await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  const { id } = params
  let body: Record<string, any> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const fields: Record<string, string> = {
    name: 'p_name',
    description: 'p_description',
    pitch: 'p_pitch',
    website: 'p_website',
    twitter: 'p_twitter',
    logo_url: 'p_logo_url',
    stage: 'p_stage',
    vote_threshold: 'p_vote_threshold',
    capital_target: 'p_capital_target',
  }

  const rpcArgs: Record<string, any> = {
    p_admin_user_id: admin.id,
    p_startup_id: id,
  }

  for (const [key, param] of Object.entries(fields)) {
    if (key in body) {
      rpcArgs[param] = body[key] ?? null
    }
  }

  if (typeof rpcArgs.p_logo_url === 'string' && rpcArgs.p_logo_url) {
    const { error: logoError, logoUrl: validatedLogoUrl } = await validateLogoUrl(rpcArgs.p_logo_url, id)
    if (logoError) {
      return NextResponse.json({ error: logoError }, { status: 400 })
    }
    rpcArgs.p_logo_url = validatedLogoUrl
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('admin_update_startup', rpcArgs)

    if (error) {
      return handleRpcError('admin_update_startup', error)
    }

    const result = Array.isArray(data) ? data[0] : data
    return NextResponse.json(result || { ok: true })
  } catch (err: any) {
    console.error('[api/admin/startups] PATCH unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
