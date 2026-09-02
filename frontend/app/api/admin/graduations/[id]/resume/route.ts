import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { resumeGraduation } from '@/lib/graduation/resume'
import { errorResponse } from '@/lib/errorResponse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function handleAuthError(err: any) {
  if (err?.message === 'Forbidden' || err?.message === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let admin
  try {
    admin = await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  const { id } = params

  try {
    const result = await resumeGraduation(id, admin)
    return NextResponse.json(result)
  } catch (err: any) {
    const message = err?.message || 'Internal server error'
    const lower = message.toLowerCase()
    console.error('[api/admin/graduations/resume] error:', err)

    if (lower.includes('not halted') || lower.includes('active resume request')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    if (lower.includes('not found') || lower.includes('no previous status')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }

    return errorResponse({
      status: 500,
      message: message || 'Internal server error',
      error: err,
      request,
    })
  }
}
