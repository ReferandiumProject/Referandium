import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const {
      name,
      description,
      vote_threshold,
      capital_target,
      pitch,
      website,
      twitter,
      logo_url,
      stage,
    } = body || {}

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Startup name is required' }, { status: 400 })
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const voteThresholdNum = Number(vote_threshold)
    if (!Number.isInteger(voteThresholdNum) || voteThresholdNum <= 0) {
      return NextResponse.json(
        { error: 'vote_threshold must be a positive integer' },
        { status: 400 }
      )
    }

    const capitalTargetNum = Number(capital_target)
    if (!Number.isFinite(capitalTargetNum) || capitalTargetNum <= 0) {
      return NextResponse.json(
        { error: 'capital_target must be a positive number' },
        { status: 400 }
      )
    }

    const optionalString = (value: unknown) => {
      if (value === undefined || value === null) return null
      if (typeof value !== 'string') {
        return { invalid: true }
      }
      return value.trim() || null
    }

    const pitchParam = optionalString(pitch)
    const websiteParam = optionalString(website)
    const twitterParam = optionalString(twitter)
    const logoUrlParam = optionalString(logo_url)
    const stageParam = optionalString(stage)

    for (const param of [pitchParam, websiteParam, twitterParam, logoUrlParam, stageParam]) {
      if (typeof param === 'object' && param?.invalid) {
        return NextResponse.json({ error: 'Optional fields must be strings' }, { status: 400 })
      }
    }

    const { data: listingData, error: listingError } = await supabaseAdmin.rpc(
      'create_startup_listing',
      {
        p_user_id: user.id,
        p_name: name.trim(),
        p_description: description.trim(),
        p_vote_threshold: voteThresholdNum,
        p_capital_target: capitalTargetNum,
        p_pitch: pitchParam as string | null,
        p_website: websiteParam as string | null,
        p_twitter: twitterParam as string | null,
        p_logo_url: logoUrlParam as string | null,
        p_stage: stageParam as string | null,
      }
    )

    if (listingError) {
      const msg = listingError.message || ''
      console.error('[api/startup-listings] create_startup_listing error:', listingError)

      if (msg.includes('Insufficient balance') || msg.includes('No balance found') || msg.includes('listing credit')) {
        return NextResponse.json({ error: msg }, { status: 402 })
      }
      if (msg.includes('must be between') || msg.includes('is required')) {
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      return NextResponse.json({ error: msg || 'Failed to create listing' }, { status: 500 })
    }

    const result = Array.isArray(listingData) ? listingData[0] : listingData

    if (!result) {
      console.error('[api/startup-listings] create_startup_listing returned no data')
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    return NextResponse.json({
      id: result.r_startup_id,
      slug: result.r_slug,
      paid_with: result.r_paid_with,
      fee: Number(result.r_fee ?? 0),
      credits_left: Number(result.r_credits_left ?? 0),
      available_after: Number(result.r_available_after ?? 0),
    })
  } catch (err: any) {
    const message = err?.message || 'Unauthorized'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[api/startup-listings] unexpected error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
