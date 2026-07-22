import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: gookies, error } = await supabaseAdmin
    .from('gookies')
    .select('*')
    .order('id', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to load gookies' }, { status: 500 })
  }

  const userIds = new Set<string>()
  for (const g of gookies || []) {
    if (g.user_id) userIds.add(g.user_id as string)
    if (g.invited_by) userIds.add(g.invited_by as string)
  }

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .in('id', Array.from(userIds))

  const userMap: Record<string, string | null> = {}
  for (const u of users || []) {
    userMap[u.id as string] = u.email
  }

  const enriched = (gookies || []).map((g: any) => ({
    ...g,
    user_email: userMap[g.user_id as string] || null,
    invited_by_email: userMap[g.invited_by as string] || null,
  }))

  return NextResponse.json({ gookies: enriched })
}

export async function POST(request: NextRequest) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { user_id?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { user_id, email } = body
  if (!user_id && !email) {
    return NextResponse.json(
      { error: 'Provide user_id or email' },
      { status: 400 }
    )
  }

  let targetUserId = user_id
  if (email) {
    const { data: found, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('id')
      .ilike('email', email.trim())
      .limit(1)
      .single()

    if (lookupError || !found) {
      return NextResponse.json(
        { error: 'User with that email not found' },
        { status: 404 }
      )
    }
    targetUserId = found.id as string
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('gookies')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('status', 'active')
    .limit(1)

  if (existingError) {
    console.error('[admin/gookies POST] existing check error:', existingError)
    return NextResponse.json({ error: 'Failed to check existing gookie' }, { status: 500 })
  }

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'Already an active Gookie' },
      { status: 409 }
    )
  }

  const { data: gookie, error: insertError } = await supabaseAdmin
    .from('gookies')
    .insert({
      user_id: targetUserId,
      status: 'active',
      invited_by: user.id,
    })
    .select('*')
    .single()

  if (insertError) {
    console.error('[admin/gookies POST] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to invite gookie' }, { status: 500 })
  }

  return NextResponse.json({ gookie }, { status: 201 })
}
