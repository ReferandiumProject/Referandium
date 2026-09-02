import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { recordSystemError } from '@/lib/system-errors'

export async function POST(request: Request) {
  let userId: string | null = null

  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const user = await getAuthenticatedUser(request)
      userId = user.id
    }
  } catch {
    // Record the client error even if auth fails; user_id will be null.
  }

  try {
    const body = await request.json()

    await recordSystemError({
      source: 'client',
      name: typeof body?.name === 'string' ? body.name : 'ClientError',
      message: typeof body?.message === 'string' ? body.message : 'Unknown client error',
      stack: typeof body?.stack === 'string' ? body.stack : null,
      path: typeof body?.path === 'string' ? body.path : null,
      userId,
      context:
        typeof body?.context === 'object' && body.context !== null
          ? (body.context as Record<string, unknown>)
          : null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Never surface a failure to record to the browser; the user is already
    // looking at a crashed page.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
