import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    const { data: positions, error: positionsError } = await supabaseAdmin
      .from('positions')
      .select('id, market_id, option_id, shares, avg_price')
      .eq('user_id', user.id)

    if (positionsError) {
      console.error('[api/profile/positions] query error:', positionsError)
      return NextResponse.json(
        { error: 'Failed to fetch positions' },
        { status: 500 }
      )
    }

    const marketIds = [
      ...new Set((positions || []).map((p: any) => p.market_id).filter(Boolean)),
    ]

    let marketsData: { id: string; title: string }[] = []
    let optionsData: { id: string; label: string; market_id: string; shares_outstanding: number }[] = []

    if (marketIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('markets')
        .select('id, title')
        .in('id', marketIds as any)
      if (error) {
        console.error('[api/profile/positions] markets query error:', error)
        return NextResponse.json(
          { error: 'Failed to fetch markets' },
          { status: 500 }
        )
      }
      marketsData = (data as any) || []
    }

    if (marketIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('market_options')
        .select('id, label, market_id, shares_outstanding')
        .in('market_id', marketIds as any)
      if (error) {
        console.error('[api/profile/positions] options query error:', error)
        return NextResponse.json(
          { error: 'Failed to fetch options' },
          { status: 500 }
        )
      }
      optionsData = (data as any) || []
    }

    const marketMap = new Map(marketsData.map((m) => [m.id, m.title]))
    const optionMap = new Map(optionsData.map((o) => [o.id, o.label]))

    const result = (positions || []).map((p: any) => ({
      id: p.id,
      market_id: p.market_id,
      option_id: p.option_id,
      market_title: marketMap.get(p.market_id) || 'Unknown',
      option_label: optionMap.get(p.option_id) || 'Unknown',
      shares: Number(p.shares ?? 0),
      avg_price: Number(p.avg_price ?? 0),
    }))

    return NextResponse.json({ positions: result, options: optionsData })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
