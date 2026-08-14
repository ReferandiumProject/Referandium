import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const { data, error } = await supabaseAdmin
      .from('stripe_payments')
      .select('id,usdc_granted,release_after')
      .eq('user_id', user.id)
      .eq('product', 'investment_pack')
      .eq('status', 'paid')
      .not('release_after', 'is', null)
      .order('release_after', { ascending: true })

    if (error) {
      console.error('[api/investment-packs/pending] failed to load pending packs:', error)
      return NextResponse.json(
        { error: 'Failed to load pending investment packs' },
        { status: 500 }
      )
    }

    return NextResponse.json({ packs: data ?? [] })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/investment-packs/pending] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
