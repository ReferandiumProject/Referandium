import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { mintGraduationToken } from '@/lib/graduation/mint'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    const status = (err as { status?: number }).status ?? 401
    const message =
      err instanceof Error ? err.message : 'Unauthorized'
    return NextResponse.json({ error: message }, { status })
  }

  const { id } = params
  if (!id) {
    return NextResponse.json(
      { error: 'Missing graduation id' },
      { status: 400 }
    )
  }

  try {
    const result = await mintGraduationToken(id)
    if (!result.success) {
      return NextResponse.json(
        { error: result.reason, halted: true },
        { status: 500 }
      )
    }
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[api/admin/graduations/mint] unexpected error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
