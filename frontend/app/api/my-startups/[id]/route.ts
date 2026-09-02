import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { validateLogoUrl } from '@/lib/logo-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Deliberately not editable here: name, slug, vote_threshold, capital_target.
// Only admins can change those (see app/api/admin/startups/[id]/route.ts).
const EDITABLE_FIELDS: Record<string, string> = {
  description: 'p_description',
  pitch: 'p_pitch',
  website: 'p_website',
  twitter: 'p_twitter',
  logo_url: 'p_logo_url',
  stage: 'p_stage',
}

function handleRpcError(err: any) {
  const message = err?.message || ''
  console.error('[api/my-startups] founder_update_startup RPC error:', err)

  if (message === 'You do not own this startup') {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('has been removed')) {
    return NextResponse.json({ error: message }, { status: 404 })
  }

  return NextResponse.json({ error: message || 'Internal server error' }, { status: 500 })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  let body: Record<string, any> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const rpcArgs: Record<string, any> = {
    p_user_id: user.id,
    p_startup_id: id,
  }

  for (const [key, param] of Object.entries(EDITABLE_FIELDS)) {
    if (!(key in body)) {
      rpcArgs[param] = null
      continue
    }
    const value = body[key]
    if (value !== null && typeof value !== 'string') {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 })
    }
    rpcArgs[param] = value === null ? null : value.trim()
  }

  if (typeof rpcArgs.p_logo_url === 'string' && rpcArgs.p_logo_url) {
    const { error: logoError, logoUrl: validatedLogoUrl } = await validateLogoUrl(rpcArgs.p_logo_url, id)
    if (logoError) {
      return NextResponse.json({ error: logoError }, { status: 400 })
    }
    rpcArgs.p_logo_url = validatedLogoUrl
  }

  try {
    const { error } = await supabaseAdmin.rpc('founder_update_startup', rpcArgs)

    if (error) {
      return handleRpcError(error)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[api/my-startups] PATCH unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
