import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/admin/graduations/[id]/mint/route'
import { getAdminUser } from '@/lib/admin'
import { mintGraduationToken } from '@/lib/graduation/mint'
import { TokenAmount } from '@/lib/token-amount'

vi.mock('@/lib/admin', () => ({
  getAdminUser: vi.fn(),
}))

vi.mock('@/lib/graduation/mint', () => ({
  mintGraduationToken: vi.fn(),
}))

describe('TokenAmount', () => {
  it('converts the designr total supply to base units', () => {
    const amount = TokenAmount.fromDatabase('100000000.000000', 6)
    expect(amount.toBaseUnit()).toBe(BigInt('100000000000000'))
  })

  it('converts the designr holder allocation to base units', () => {
    const amount = TokenAmount.fromDatabase('78149999.495993', 6)
    expect(amount.toBaseUnit()).toBe(BigInt('78149999495993'))
  })

  it('converts integer database values', () => {
    const amount = TokenAmount.fromDatabase('100', 6)
    expect(amount.toBaseUnit()).toBe(BigInt('100000000'))
  })

  it('rejects values with too many decimals', () => {
    expect(() => TokenAmount.fromDatabase('1.1234567', 6)).toThrow()
  })
})

function makeRequest(id: string) {
  return new Request(
    `http://localhost:3000/api/admin/graduations/${id}/mint`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token' },
    }
  )
}

describe('POST /api/admin/graduations/[id]/mint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with the mint result', async () => {
    vi.mocked(getAdminUser).mockResolvedValue({
      id: 'admin-user',
      email: 'admin@example.com',
    } as any)

    vi.mocked(mintGraduationToken).mockResolvedValue({
      success: true,
      mintAddress: 'mock-mint',
      escrowAddress: 'mock-escrow',
      signatures: {
        mint: 'mock-mint-sig',
        metadata: 'mock-meta-sig',
        escrowFund: 'mock-fund-sig',
      },
    })

    const res = await POST(makeRequest('grad-1'), { params: { id: 'grad-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.mintAddress).toBe('mock-mint')
    expect(mintGraduationToken).toHaveBeenCalledWith('grad-1')
  })

  it('returns 500 with halted details when minting cannot proceed', async () => {
    vi.mocked(getAdminUser).mockResolvedValue({
      id: 'admin-user',
      email: 'admin@example.com',
    } as any)

    vi.mocked(mintGraduationToken).mockResolvedValue({
      success: false,
      halted: true,
      reason: 'bad status',
    })

    const res = await POST(makeRequest('grad-1'), { params: { id: 'grad-1' } })
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.halted).toBe(true)
    expect(body.error).toBe('bad status')
  })

  it('rejects unauthenticated requests before calling the mint', async () => {
    const err = new Error('Unauthorized')
    ;(err as any).status = 401
    vi.mocked(getAdminUser).mockRejectedValue(err)

    const res = await POST(makeRequest('grad-1'), { params: { id: 'grad-1' } })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toMatch(/unauthorized/i)
    expect(mintGraduationToken).not.toHaveBeenCalled()
  })
})
