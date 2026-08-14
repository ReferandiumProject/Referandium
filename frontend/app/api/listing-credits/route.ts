import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const { data, error } = await supabaseAdmin
      .from('user_listing_credits')
      .select('credits')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[api/listing-credits] failed to load credits:', error)
      return NextResponse.json({ error: 'Failed to load listing credits' }, { status: 500 })
    }

    return NextResponse.json({ credits: data?.credits ?? 0 })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/listing-credits] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
