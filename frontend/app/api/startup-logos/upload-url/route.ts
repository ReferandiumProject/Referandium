import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import {
  LOGO_BUCKET,
  extensionForContentType,
  generateLogoPath,
} from '@/lib/logo-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const startupId = body?.startup_id
  if (!startupId || typeof startupId !== 'string') {
    return NextResponse.json({ error: 'startup_id is required' }, { status: 400 })
  }

  const contentType = body?.content_type
  if (!contentType || typeof contentType !== 'string') {
    return NextResponse.json({ error: 'content_type is required' }, { status: 400 })
  }

  if (!extensionForContentType(contentType)) {
    return NextResponse.json(
      { error: 'Unsupported content type. Use image/png, image/jpeg, or image/webp.' },
      { status: 400 }
    )
  }

  const { data: startup, error: startupError } = await supabaseAdmin
    .from('startup_startups')
    .select('id')
    .eq('id', startupId)
    .eq('user_id', user.id)
    .single()

  if (startupError || !startup) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const pathInfo = generateLogoPath(startupId, contentType)
  if (!pathInfo) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })
  }

  const { path } = pathInfo

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(LOGO_BUCKET)
    .createSignedUploadUrl(path, { upsert: false })

  if (signedError || !signed) {
    console.error('[startup-logos/upload-url] createSignedUploadUrl error:', signedError)
    return NextResponse.json({ error: 'Could not create upload URL' }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(LOGO_BUCKET).getPublicUrl(path)

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    path,
    publicUrl,
  })
}
