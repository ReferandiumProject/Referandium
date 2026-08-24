import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const { data, error } = await supabaseAdmin
      .from('linked_wallets')
      .select('address, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[wallet-link] list error:', error)
      return NextResponse.json({ error: 'Unable to load linked wallets' }, { status: 500 })
    }

    return NextResponse.json({ linked_wallets: data ?? [] })
  } catch (err: any) {
    console.error('[wallet-link] list error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: err.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
