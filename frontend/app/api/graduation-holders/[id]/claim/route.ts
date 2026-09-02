import { NextResponse } from 'next/server'

import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { claimGraduationHolding } from '@/lib/graduation/claim'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser(request)
  const result = await claimGraduationHolding(params.id, user.id)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Unknown error' },
      { status: result.status ?? 500 }
    )
  }

  return NextResponse.json({
    signature: result.signature!,
    already_claimed: result.already_claimed ?? false,
  })
}
