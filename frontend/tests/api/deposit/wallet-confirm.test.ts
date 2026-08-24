import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { POST as confirmWalletDeposit } from '@/app/api/deposit/wallet/confirm/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const originalRpcUrl = process.env.SOLANA_RPC_URL
const originalPlatformAddress = process.env.PLATFORM_SOLANA_ADDRESS
const originalUsdcMint = process.env.USDC_MINT_ADDRESS

function makeRequest(signature: string) {
  return new Request('http://localhost:3000/api/deposit/wallet/confirm', {
    method: 'POST',
    headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature }),
  })
}

describe('POST /api/deposit/wallet/confirm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterAll(() => {
    vi.restoreAllMocks()
    process.env.SOLANA_RPC_URL = originalRpcUrl
    process.env.PLATFORM_SOLANA_ADDRESS = originalPlatformAddress
    process.env.USDC_MINT_ADDRESS = originalUsdcMint
  })

  it('rejects a transfer from an unlinked wallet and does not credit anything', async () => {
    const user = await createFixtureUser()
    const ownerKeypair = Keypair.generate()
    const owner = ownerKeypair.publicKey
    const attackerKeypair = Keypair.generate()
    const attacker = attackerKeypair.publicKey

    await supabaseAdmin
      .from('users')
      .update({
        wallet_address: owner.toBase58(),
        custodial_wallet_address: owner.toBase58(),
      })
      .eq('id', user.id)

    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '0',
      locked_usdc: '0',
    })

    const usdcMint = Keypair.generate().publicKey
    const platformOwner = Keypair.generate().publicKey
    const platformAta = await getAssociatedTokenAddress(usdcMint, platformOwner)
    const userAta = await getAssociatedTokenAddress(usdcMint, owner)
    const attackerAta = await getAssociatedTokenAddress(usdcMint, attacker)

    process.env.SOLANA_RPC_URL = 'http://localhost:8899'
    process.env.PLATFORM_SOLANA_ADDRESS = platformOwner.toBase58()
    process.env.USDC_MINT_ADDRESS = usdcMint.toBase58()

    const parsedTx = {
      meta: {
        err: null,
        preTokenBalances: [
          {
            accountIndex: 0,
            mint: usdcMint.toBase58(),
            owner: platformOwner.toBase58(),
            uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0, uiAmountString: '0' },
          },
          {
            accountIndex: 2,
            mint: usdcMint.toBase58(),
            owner: attacker.toBase58(),
            uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1, uiAmountString: '1' },
          },
        ],
        postTokenBalances: [
          {
            accountIndex: 0,
            mint: usdcMint.toBase58(),
            owner: platformOwner.toBase58(),
            uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1, uiAmountString: '1' },
          },
          {
            accountIndex: 2,
            mint: usdcMint.toBase58(),
            owner: attacker.toBase58(),
            uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0, uiAmountString: '0' },
          },
        ],
      },
      transaction: {
        message: {
          accountKeys: [platformAta, userAta, attackerAta],
        },
      },
    }

    vi.spyOn(Connection.prototype, 'getParsedTransaction').mockResolvedValue(parsedTx as any)
    const rpcSpy = vi
      .spyOn(supabaseAdmin as any, 'rpc')
      .mockResolvedValue({ data: { new_balance: 1 }, error: null })

    vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)

    try {
      const res = await confirmWalletDeposit(makeRequest('mock-signature-from-attacker'))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/not sent from a wallet linked to your account/i)

      expect(rpcSpy).not.toHaveBeenCalled()

      const { data: balance } = await supabaseAdmin
        .from('balances')
        .select('available_usdc')
        .eq('user_id', user.id)
        .single()
      expect(Number(balance!.available_usdc)).toBe(0)
    } finally {
      await cleanupFixtures(user.id, [])
    }
  })
})
