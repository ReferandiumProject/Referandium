import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

import { POST } from '@/app/api/graduation-holders/[id]/claim/route'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/graduation/claim', () => ({
  claimGraduationHolding: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { claimGraduationHolding } from '@/lib/graduation/claim'

const user = { id: 'user-1', email: 'user@example.com' }

function makeRequest(id: string, body?: any) {
  return new Request(`http://localhost:3000/api/graduation-holders/${id}/claim`, {
    method: 'POST',
    headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/graduation-holders/[id]/claim', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('takes the user from the session and ignores any user id in the body', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    vi.mocked(claimGraduationHolding).mockResolvedValue({
      success: true,
      signature: 'mock-sig',
    } as any)

    const res = await POST(makeRequest('holding-1', { user_id: 'attacker' }), {
      params: { id: 'holding-1' },
    } as any)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.signature).toBe('mock-sig')
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(1)
    expect(claimGraduationHolding).toHaveBeenCalledWith('holding-1', 'user-1')
    expect(claimGraduationHolding).not.toHaveBeenCalledWith('holding-1', 'attacker')
  })

  it('returns the error and status from a failed claim', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    vi.mocked(claimGraduationHolding).mockResolvedValue({
      success: false,
      error: 'This holding does not belong to the authenticated user',
      status: 403,
    } as any)

    const res = await POST(makeRequest('holding-1'), {
      params: { id: 'holding-1' },
    } as any)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('This holding does not belong to the authenticated user')
  })
})
