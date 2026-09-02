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

export type UnknownWithdrawal = {
  id: string
  user_id: string
  amount_usdc: string
  signature: string | null
  created_at: string
}

export async function GET(request: Request) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('withdrawals')
      .select('id, user_id, amount_usdc::text, signature, created_at')
      .eq('status', 'unknown')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/admin/unknown-withdrawals] query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json((data ?? []) as UnknownWithdrawal[])
  } catch (err: any) {
    console.error('[api/admin/unknown-withdrawals] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
