import { NextResponse } from 'next/server'

import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request)

  const { searchParams } = new URL(request.url)
  const startupId = searchParams.get('startup_id')

  let query = supabaseAdmin
    .from('graduation_holders')
    .select(
      `id,
       graduation_id,
       user_id,
       wallet_address,
       tokens_onchain::text,
       status,
       signature,
       error,
       claimed_at,
       graduations!inner (
         startup_id,
         token_name,
         token_symbol,
         mint_address,
         escrow_address,
         startup_startups!inner (
           name,
           slug,
           logo_url
         )
       )`
    )
    .eq('user_id', user.id)

  if (startupId) {
    query = query.eq('graduations.startup_id', startupId)
  }

  const { data: raw, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const holdings = (raw ?? []).map((row: any) => {
    const grad = row.graduations as any
    const startup = grad?.startup_startups as any
    return {
      id: row.id as string,
      graduation_id: row.graduation_id as string,
      startup_id: grad?.startup_id as string,
      startup_name: startup?.name as string,
      startup_slug: startup?.slug as string,
      startup_logo_url: startup?.logo_url as string | null,
      token_name: grad?.token_name as string,
      token_symbol: grad?.token_symbol as string,
      mint_address: grad?.mint_address as string | null,
      escrow_address: grad?.escrow_address as string | null,
      wallet_address: row.wallet_address as string | null,
      tokens_onchain: row.tokens_onchain as string,
      status: row.status as string,
      signature: row.signature as string | null,
      error: row.error as string | null,
      claimed_at: row.claimed_at as string | null,
    }
  })

  return NextResponse.json({ holdings })
}
