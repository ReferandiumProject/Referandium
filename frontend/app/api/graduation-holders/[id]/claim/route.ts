import { NextResponse } from 'next/server'

import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { claimGraduationHolding } from '@/lib/graduation/claim'
import { errorResponse } from '@/lib/errorResponse'
import { supabaseAdmin } from '@/lib/supabaseServer'

async function markHolderFailed(holdingId: string, reason: string) {
  try {
    await supabaseAdmin
      .from('graduation_holders')
      .update({
        status: 'failed',
        error: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', holdingId)
  } catch (err) {
    console.error('[api/graduation-holders/claim] failed to update holder:', err)
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  let userId: string

  try {
    const user = await getAuthenticatedUser(request)
    userId = user.id
  } catch {
    return errorResponse({
      status: 401,
      message: 'Unauthorized',
      request,
    })
  }

  try {
    const result = await claimGraduationHolding(id, userId)

    if (!result.success) {
      const status = result.status ?? 500
      if (status >= 500) {
        await markHolderFailed(id, result.error ?? 'Unknown claim error')
      }
      return errorResponse({
        status,
        message: result.error ?? 'Unknown claim error',
        error: new Error(result.error ?? 'Unknown claim error'),
        request,
        data: { holding_id: id },
      })
    }

    return NextResponse.json({
      signature: result.signature!,
      already_claimed: result.already_claimed ?? false,
    })
  } catch (err: any) {
    const message = err?.message ?? 'Claim failed'
    await markHolderFailed(id, message)
    return errorResponse({
      status: 500,
      message,
      error: err,
      request,
      data: { holding_id: id },
    })
  }
}
