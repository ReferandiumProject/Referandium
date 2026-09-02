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

export type GraduationAdminRow = {
  id: string
  status: string
  halted_reason: string | null
  startup_id: string
  startup_name: string
  startup_slug: string
  token_name: string | null
  token_symbol: string | null
  mint_address: string | null
  escrow_address: string | null
  created_at: string
  escrow_expected: string | null
  still_owed: string | null
  comparable: boolean | null
  holder_counts: {
    claimable: number
    failed: number
    awaiting_wallet: number
  }
}

export async function GET(request: Request) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  try {
    const { data: gradRows, error: gradError } = await supabaseAdmin
      .from('graduations')
      .select(
        'id, status, halted_reason, startup_id, token_name, token_symbol, mint_address, escrow_address, created_at, startup_startups!inner (name, slug)'
      )
      .order('created_at', { ascending: false })

    if (gradError) {
      console.error('[api/admin/graduations] graduations query error:', gradError)
      return NextResponse.json({ error: gradError.message }, { status: 500 })
    }

    const graduationIds = (gradRows ?? []).map((g: any) => g.id as string)

    const [{ data: escrowRows, error: escrowError }, { data: holderRows, error: holderError }] =
      graduationIds.length === 0
        ? [{ data: [], error: null }, { data: [], error: null }]
        : await Promise.all([
            supabaseAdmin
              .from('graduation_escrow_expected')
              .select('graduation_id, escrow_expected::text, still_owed::text, comparable')
              .in('graduation_id', graduationIds),
            supabaseAdmin
              .from('graduation_holders')
              .select('graduation_id, status')
              .in('graduation_id', graduationIds),
          ])

    if (escrowError) {
      console.error('[api/admin/graduations] escrow query error:', escrowError)
      return NextResponse.json({ error: escrowError.message }, { status: 500 })
    }

    if (holderError) {
      console.error('[api/admin/graduations] holders query error:', holderError)
      return NextResponse.json({ error: holderError.message }, { status: 500 })
    }

    const escrowByGrad = new Map<string, { escrow_expected: string; still_owed: string; comparable: boolean }>()
    for (const row of (escrowRows ?? []) as any[]) {
      if (row.graduation_id) {
        escrowByGrad.set(row.graduation_id as string, {
          escrow_expected: row.escrow_expected as string,
          still_owed: row.still_owed as string,
          comparable: row.comparable as boolean,
        })
      }
    }

    const countsByGrad = new Map<string, { claimable: number; failed: number; awaiting_wallet: number }>()
    for (const g of graduationIds) {
      countsByGrad.set(g, { claimable: 0, failed: 0, awaiting_wallet: 0 })
    }
    for (const h of (holderRows ?? []) as any[]) {
      const g = h.graduation_id as string
      const status = h.status as string
      const current = countsByGrad.get(g)
      if (!current) continue
      if (status === 'claimable') current.claimable += 1
      if (status === 'failed') current.failed += 1
      if (status === 'awaiting_wallet') current.awaiting_wallet += 1
      countsByGrad.set(g, current)
    }

    const rows: GraduationAdminRow[] = ((gradRows ?? []) as any[]).map((g: any) => {
      const startup = g.startup_startups as any
      const escrow = escrowByGrad.get(g.id as string)
      return {
        id: g.id as string,
        status: g.status as string,
        halted_reason: (g.halted_reason as string | null) ?? null,
        startup_id: g.startup_id as string,
        startup_name: startup?.name as string,
        startup_slug: startup?.slug as string,
        token_name: (g.token_name as string | null) ?? null,
        token_symbol: (g.token_symbol as string | null) ?? null,
        mint_address: (g.mint_address as string | null) ?? null,
        escrow_address: (g.escrow_address as string | null) ?? null,
        created_at: g.created_at as string,
        escrow_expected: escrow?.escrow_expected ?? null,
        still_owed: escrow?.still_owed ?? null,
        comparable: escrow?.comparable ?? null,
        holder_counts: countsByGrad.get(g.id as string) ?? { claimable: 0, failed: 0, awaiting_wallet: 0 },
      }
    })

    return NextResponse.json(rows)
  } catch (err: any) {
    console.error('[api/admin/graduations] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
