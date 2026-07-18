import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseServer'
import { getAuthenticatedUser } from '../../../lib/auth-helpers'
import { isAdmin } from '../../../lib/admin'

export const runtime = 'nodejs'

interface CreateMarketBody {
  title: string
  description?: string
  category?: string
  end_date: string
  resolution_criteria?: string
}

export async function POST(request: Request) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: CreateMarketBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, description, category, end_date, resolution_criteria } = body

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  if (!end_date || typeof end_date !== 'string' || Number.isNaN(Date.parse(end_date))) {
    return NextResponse.json({ error: 'end_date must be a valid ISO date string' }, { status: 400 })
  }

  const marketInsert = {
    title: title.trim(),
    description: description?.trim() || null,
    category: category?.trim() || 'Other',
    end_date,
    resolution_criteria: resolution_criteria?.trim() || null,
    status: 'active',
    outcome: 'unresolved',
    creator_id: user.id,
    creator_type: 'admin',
  }

  let marketId: string | null = null

  try {
    const { data: market, error: marketError } = await supabaseAdmin
      .from('markets')
      .insert(marketInsert as any)
      .select('*')
      .single()

    if (marketError || !market) {
      throw new Error(marketError?.message || 'Failed to create market')
    }

    marketId = market.id

    const { error: optionsError } = await supabaseAdmin
      .from('market_options')
      .insert([
        { market_id: marketId, label: 'YES', shares_outstanding: 0 } as any,
        { market_id: marketId, label: 'NO', shares_outstanding: 0 } as any,
      ])

    if (optionsError) {
      throw new Error(optionsError.message)
    }

    const { error: subsidyError } = await supabaseAdmin
      .from('market_subsidies')
      .insert({ market_id: marketId, usdc_amount: 69 } as any)

    if (subsidyError) {
      throw new Error(subsidyError.message)
    }

    const { data: options, error: fetchOptionsError } = await supabaseAdmin
      .from('market_options')
      .select('*')
      .eq('market_id', marketId)

    if (fetchOptionsError) {
      throw new Error(fetchOptionsError.message)
    }

    return NextResponse.json({ market, options: options || [] }, { status: 201 })
  } catch (error: any) {
    if (marketId) {
      await supabaseAdmin.from('markets').delete().eq('id', marketId)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create market' },
      { status: 500 }
    )
  }
}
