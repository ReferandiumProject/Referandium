import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

import { POST } from '@/app/api/graduation-holders/[id]/claim/route'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/graduation/claim', () => ({
  claimGraduationHolding: vi.fn(),
}))

vi.mock('@/lib/errorResponse', () => ({
  errorResponse: vi.fn((params: any) => {
    return new Response(JSON.stringify({ error: params.message }), {
      status: params.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }),
}))

vi.mock('@/lib/supabaseServer', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}))

import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { claimGraduationHolding } from '@/lib/graduation/claim'
import { errorResponse } from '@/lib/errorResponse'
import { supabaseAdmin } from '@/lib/supabaseServer'

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
      already_claimed: false,
    } as any)

    const res = await POST(makeRequest('holding-1', { user_id: 'attacker' }), {
      params: { id: 'holding-1' },
    } as any)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.signature).toBe('mock-sig')
    expect(json.already_claimed).toBe(false)
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

  it('records a 5xx claim failure in system_errors and marks the holder row as failed', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    vi.mocked(claimGraduationHolding).mockResolvedValue({
      success: false,
      error: 'Could not sign the claim transaction',
      status: 500,
    } as any)

    const res = await POST(makeRequest('holding-1'), {
      params: { id: 'holding-1' },
    } as any)

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Could not sign the claim transaction')

    expect(supabaseAdmin.from).toHaveBeenCalledWith('graduation_holders')
    const updateCall = (supabaseAdmin.from as any).mock.results[0].value.update
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Could not sign the claim transaction',
      })
    )

    expect(errorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        message: 'Could not sign the claim transaction',
        request: expect.any(Request),
        data: { holding_id: 'holding-1' },
      })
    )
  })

  it('catches unexpected thrown errors, marks the holder failed, and records system_errors', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
    vi.mocked(claimGraduationHolding).mockRejectedValue(
      new Error('Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars')
    )

    const res = await POST(makeRequest('holding-1'), {
      params: { id: 'holding-1' },
    } as any)

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe(
      'Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars'
    )

    expect(supabaseAdmin.from).toHaveBeenCalledWith('graduation_holders')
    const updateCall = (supabaseAdmin.from as any).mock.results[0].value.update
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars',
      })
    )

    expect(errorResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        message:
          'Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars',
        error: expect.any(Error),
        request: expect.any(Request),
        data: { holding_id: 'holding-1' },
      })
    )
  })
})
