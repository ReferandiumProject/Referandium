import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { isAdmin } from '@/lib/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 401 })
  }

  return NextResponse.json({ isAdmin: isAdmin(user.email) })
}
