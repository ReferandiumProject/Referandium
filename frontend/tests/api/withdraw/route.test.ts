import { describe, it, expect, vi, afterAll } from 'vitest'
import { POST } from '@/app/api/withdraw/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser } from '../startup-votes/fixtures'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

process.env.PLATFORM_WALLET_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey)
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com'
process.env.USDC_MINT_ADDRESS = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

// On-curve fixture address that cannot be confused with a real production wallet.
const MOCK_WALLET = Keypair.generate().publicKey.toBase58()

function makeRequest(userId: string, amount: number, wallet: string) {
  return new Request('http://localhost:3000/api/withdraw', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer mock-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount_usdc: amount, wallet_address: wallet }),
  })
}

async function cleanupWithdrawalTest(userId: string) {
  // User-id-only deletion. ledger_liability is a view and recalculates from
  // ledger_adjustments, withdrawals and balances; we remove the source rows.
  await supabaseAdmin.from('ledger_adjustments').delete().eq('user_id', userId)
  await supabaseAdmin.from('withdrawals').delete().eq('user_id', userId)
  await supabaseAdmin.from('balances').delete().eq('user_id', userId)
  await supabaseAdmin.from('users').delete().eq('id', userId)
}

describe('POST /api/withdraw', () => {
  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('refunds when finalize_withdrawal fails with a unique violation', async () => {
    const user = await createFixtureUser()
    const signature = `mock-signature-${user.id}`
    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '100',
      locked_usdc: '0',
    })

    const originalRpc = (supabaseAdmin as any).rpc

    try {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue(null as any)
      vi.spyOn(Connection.prototype, 'sendTransaction').mockResolvedValue(signature as any)
      vi.spyOn(Connection.prototype, 'confirmTransaction').mockResolvedValue({} as any)

      const rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
        if (name === 'reserve_withdrawal') {
          return { data: { withdrawal_id: 'mock-withdrawal-id', new_balance: 99 }, error: null }
        }
        if (name === 'finalize_withdrawal') {
          return {
            data: null,
            error: { message: 'duplicate key value violates unique constraint "withdrawals_signature_key"', code: '23505' },
          }
        }
        if (name === 'refund_withdrawal') {
          return { data: null, error: null }
        }
        return originalRpc.call(supabaseAdmin, name, params)
      })

      const res = await POST(makeRequest(user.id, 1, MOCK_WALLET))
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body.error).toMatch(/refunded/i)
      expect(rpcSpy).toHaveBeenCalledWith('refund_withdrawal', {
        p_withdrawal_id: 'mock-withdrawal-id',
      })

      const { data: balance } = await supabaseAdmin
        .from('balances')
        .select('available_usdc')
        .eq('user_id', user.id)
        .single()

      expect(Number(balance?.available_usdc)).toBe(100)
    } finally {
      vi.restoreAllMocks()
      await cleanupWithdrawalTest(user.id)
    }
  })

  it('rejects a token account address before reserving', async () => {
    const user = await createFixtureUser()
    try {
      await supabaseAdmin.from('balances').insert({
        user_id: user.id,
        available_usdc: '100',
        locked_usdc: '0',
      })

      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({
        executable: false,
        owner: TOKEN_PROGRAM_ID,
        lamports: 100_000,
        data: Buffer.alloc(0),
        rentEpoch: 0,
      } as any)

      const res = await POST(makeRequest(user.id, 1, MOCK_WALLET))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/token account/i)
    } finally {
      vi.restoreAllMocks()
      await cleanupWithdrawalTest(user.id)
    }
  })

  it('rejects an off-curve address before reserving', async () => {
    const [offCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('off-curve')],
      new PublicKey('11111111111111111111111111111111')
    )

    const user = await createFixtureUser()
    try {
      await supabaseAdmin.from('balances').insert({
        user_id: user.id,
        available_usdc: '100',
        locked_usdc: '0',
      })

      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({
        executable: false,
        owner: new PublicKey('11111111111111111111111111111111'),
        lamports: 100_000,
        data: Buffer.alloc(0),
        rentEpoch: 0,
      } as any)

      const res = await POST(makeRequest(user.id, 1, offCurve.toBase58()))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/cannot sign/i)
    } finally {
      vi.restoreAllMocks()
      await cleanupWithdrawalTest(user.id)
    }
  })

  it('rejects an executable program address before reserving', async () => {
    const user = await createFixtureUser()
    try {
      await supabaseAdmin.from('balances').insert({
        user_id: user.id,
        available_usdc: '100',
        locked_usdc: '0',
      })

      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({
        executable: true,
        owner: new PublicKey('11111111111111111111111111111111'),
        lamports: 100_000,
        data: Buffer.alloc(0),
        rentEpoch: 0,
      } as any)

      const res = await POST(makeRequest(user.id, 1, MOCK_WALLET))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toMatch(/program/i)
    } finally {
      vi.restoreAllMocks()
      await cleanupWithdrawalTest(user.id)
    }
  })

  it('accepts a non-existent address and completes the withdrawal', async () => {
    const user = await createFixtureUser()
    const signature = `mock-signature-accepted-${user.id}`
    const originalRpc = (supabaseAdmin as any).rpc

    try {
      await supabaseAdmin.from('balances').insert({
        user_id: user.id,
        available_usdc: '100',
        locked_usdc: '0',
      })

      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue(null as any)
      vi.spyOn(Connection.prototype, 'sendTransaction').mockResolvedValue(signature as any)
      vi.spyOn(Connection.prototype, 'confirmTransaction').mockResolvedValue({} as any)

      const rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
        if (name === 'reserve_withdrawal') {
          return { data: { withdrawal_id: 'mock-withdrawal-id', new_balance: 99 }, error: null }
        }
        if (name === 'finalize_withdrawal') {
          return { data: null, error: null }
        }
        return originalRpc.call(supabaseAdmin, name, params)
      })

      const res = await POST(makeRequest(user.id, 1, MOCK_WALLET))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.signature).toBe(signature)
      expect(Number(body.new_balance)).toBe(99)
      expect(rpcSpy).toHaveBeenCalledWith('finalize_withdrawal', {
        p_withdrawal_id: 'mock-withdrawal-id',
        p_signature: signature,
      })
    } finally {
      vi.restoreAllMocks()
      await cleanupWithdrawalTest(user.id)
    }
  })
})
