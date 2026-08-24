import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { POST as verifyWalletLink } from '@/app/api/wallet/link/verify/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2'
import bs58 from 'bs58'
import { getWalletLinkMessage } from '@/lib/wallet-link'

ed.hashes.sha512 = sha512 as any

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

function makeRequest(body: Record<string, string>) {
  return new Request('http://localhost:3000/api/wallet/link/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/wallet/link/verify', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('rejects a wrong signature and does not call complete_wallet_link', async () => {
    const ownerSecret = ed.utils.randomSecretKey()
    const ownerPublic = ed.getPublicKey(ownerSecret)
    const address = bs58.encode(ownerPublic)
    const nonce = 'test-nonce'
    const message = getWalletLinkMessage(address, nonce)

    const messageBytes = new TextEncoder().encode(message)
    const wrongMessageBytes = new TextEncoder().encode('something else')

    // A valid signature, but not over the challenge message.
    const wrongSignature = ed.sign(wrongMessageBytes, ownerSecret)

    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' } as any)

    const rpcSpy = vi
      .spyOn(supabaseAdmin as any, 'rpc')
      .mockResolvedValue({ data: null, error: null })

    const res = await verifyWalletLink(
      makeRequest({
        address,
        nonce,
        signature: bs58.encode(wrongSignature),
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid signature/i)

    // Security assertion: the route must not reach the database without a
    // verified signature. If verification were skipped, complete_wallet_link
    // would have been called and this spy would be non-empty.
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})
