import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { verifyTransfer } from '@/lib/deposits/verify-transfer'
import { errorResponse } from '@/lib/errorResponse'

export async function POST(request: Request) {
  console.log('[api/deposit] confirm request received')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/deposit] authenticated user:', user.id)
    } catch {
      console.log('[api/deposit] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { signature } = await request.json()
    console.log('[api/deposit] confirming signature:', signature)

    if (!signature || typeof signature !== 'string') {
      console.log('[api/deposit] missing signature')
      return NextResponse.json({ error: 'signature is required' }, { status: 400 })
    }

    const verified = await verifyTransfer(signature, user)

    if ('reason' in verified) {
      console.log('[api/deposit] verification failed:', verified.reason)
      return NextResponse.json({ error: verified.reason, ...verified.details }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('credit_verified_deposit', {
      p_user_id: user.id,
      p_signature: signature,
      p_amount_usdc: verified.amountUsdc,
      p_source_ata: verified.sourceAta,
    })

    if (error) {
      const isUniqueViolation =
        error.code === '23505' ||
        (typeof error.message === 'string' && error.message.includes('deposits_signature_key'))

      if (isUniqueViolation) {
        console.log('[api/deposit] duplicate signature detected')
        return NextResponse.json({ error: 'This deposit has already been credited' }, { status: 400 })
      }

      return errorResponse({
        status: 500,
        message: 'Unable to update balance',
        error,
        request,
      })
    }

    console.log('[api/deposit] deposit confirmed, new balance:', data.new_balance)
    return NextResponse.json({ credited_amount: verified.amountUsdc, new_balance: data.new_balance })
  } catch (error: any) {
    return errorResponse({
      status: 500,
      message: error.message || 'Internal server error',
      error,
      request,
    })
  }
}
