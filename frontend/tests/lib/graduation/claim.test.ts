import { describe, it, expect, vi } from 'vitest'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { claimGraduationHolding } from '@/lib/graduation/claim'

const platformKeypair = Keypair.generate()
const mintKeypair = Keypair.generate()
const escrowKeypair = Keypair.generate()
const holderKeypair = Keypair.generate()
const otherKeypair = Keypair.generate()

function makeMockSupabase(opts: { holding: any; graduation: any; user?: any }) {
  const updates: any[] = []
  const supabase = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          single: async () => {
            if (table === 'graduation_holders') {
              return { data: opts.holding, error: null }
            }
            if (table === 'graduations') {
              return { data: opts.graduation, error: null }
            }
            if (table === 'users') {
              return { data: opts.user ?? { custodial_wallet_address: null }, error: null }
            }
            return { data: null, error: null }
          },
        }),
      }),
      update: (data: any) => {
        updates.push(data)
        return {
          eq: async (col: string, val: any) => ({ error: null }),
        }
      },
    }),
  }
  return { supabase, updates }
}

function makeMockConnection(overrides?: {
  balance?: string
  sendError?: Error
  confirmError?: Error
}): Connection {
  return {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 0,
    }),
    sendRawTransaction: overrides?.sendError
      ? vi.fn().mockRejectedValue(overrides.sendError)
      : vi.fn().mockResolvedValue('mock-send-signature'),
    confirmTransaction: overrides?.confirmError
      ? vi.fn().mockRejectedValue(overrides.confirmError)
      : vi.fn().mockResolvedValue({}),
    getTokenAccountBalance: vi.fn().mockRejectedValue(new Error('not found')),
  } as unknown as Connection
}

function makeHolding(overrides: any = {}) {
  return {
    id: 'holding-1',
    graduation_id: 'grad-1',
    user_id: 'user-1',
    wallet_address: holderKeypair.publicKey.toBase58(),
    tokens_onchain: '1000.000000',
    status: 'claimable',
    signature: null,
    error: null,
    claimed_at: null,
    ...overrides,
  }
}

function makeGraduation(overrides: any = {}) {
  return {
    mint_address: mintKeypair.publicKey.toBase58(),
    escrow_address: escrowKeypair.publicKey.toBase58(),
    status: 'minted',
    ...overrides,
  }
}

describe('claimGraduationHolding', () => {
  it('refuses a claim for a holding belonging to another user and does not send any transaction', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding({ user_id: 'attacker' }),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe(403)
    expect(result.error).toBe(
      'This holding does not belong to the authenticated user'
    )
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)

    // This assertion guards the explicit ownership check: holding.user_id must equal the caller.
    // If the ownership check is removed, this test fails because sendRawTransaction is called.
  })

  it('returns the existing signature when already claimed', async () => {
    const { supabase } = makeMockSupabase({
      holding: makeHolding({
        status: 'claimed',
        signature: 'existing-sig',
      }),
      graduation: makeGraduation(),
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection: makeMockConnection(),
      platformKeypair,
    })

    expect(result.success).toBe(true)
    expect(result.signature).toBe('existing-sig')
    expect(result.already_claimed).toBe(true)
  })

  it('returns already_claimed false on first claim and true on the immediate second', async () => {
    const opts = { holding: makeHolding(), graduation: makeGraduation() }
    const { supabase, updates } = makeMockSupabase(opts as any)
    const connection = makeMockConnection()

    const first = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(first.success).toBe(true)
    expect(first.already_claimed).toBe(false)
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'claimed',
      signature: first.signature,
      claimed_at: expect.any(String),
    })

    opts.holding = { ...opts.holding, status: 'claimed', signature: first.signature }

    const second = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(second.success).toBe(true)
    expect(second.already_claimed).toBe(true)
    expect(second.signature).toBe(first.signature)
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1)
  })

  it('refuses dust_zero and does not send', async () => {
    const { supabase } = makeMockSupabase({
      holding: makeHolding({ status: 'dust_zero' }),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('refuses when the holder has no wallet address', async () => {
    const { supabase } = makeMockSupabase({
      holding: makeHolding({ wallet_address: null }),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toMatch(/still owed/)
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('fills a null snapshot wallet from users, persists it, and claims to it', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding({ wallet_address: null }),
      graduation: makeGraduation(),
      user: { custodial_wallet_address: holderKeypair.publicKey.toBase58() },
    })
    const connection = makeMockConnection()

    let sentTx: Transaction | null = null
    connection.sendRawTransaction = vi.fn((rawTx: Buffer) => {
      sentTx = Transaction.from(rawTx)
      return Promise.resolve('mock-send-signature')
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(true)
    expect(result.already_claimed).toBe(false)
    expect(updates[0]).toMatchObject({
      wallet_address: holderKeypair.publicKey.toBase58(),
    })
    expect(sentTx).not.toBeNull()
    const transferDest = sentTx!.instructions[1].keys[1].pubkey
    const expectedAta = getAssociatedTokenAddressSync(
      new PublicKey(mintKeypair.publicKey.toBase58()),
      new PublicKey(holderKeypair.publicKey.toBase58())
    )
    expect(transferDest.toBase58()).toBe(expectedAta.toBase58())
  })

  it('sends to the snapshot address even when users.custodial_wallet_address is different', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding({
        wallet_address: holderKeypair.publicKey.toBase58(),
      }),
      graduation: makeGraduation(),
      user: {
        custodial_wallet_address: otherKeypair.publicKey.toBase58(),
      },
    })
    const connection = makeMockConnection()

    let sentTx: Transaction | null = null
    connection.sendRawTransaction = vi.fn((rawTx: Buffer) => {
      sentTx = Transaction.from(rawTx)
      return Promise.resolve('mock-send-signature')
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(true)
    expect(result.already_claimed).toBe(false)
    expect(sentTx).not.toBeNull()
    const transferDest = sentTx!.instructions[1].keys[1].pubkey
    const expectedSnapshotAta = getAssociatedTokenAddressSync(
      new PublicKey(mintKeypair.publicKey.toBase58()),
      new PublicKey(holderKeypair.publicKey.toBase58())
    )
    expect(transferDest.toBase58()).toBe(expectedSnapshotAta.toBase58())

    const wrongUserAta = getAssociatedTokenAddressSync(
      new PublicKey(mintKeypair.publicKey.toBase58()),
      new PublicKey(otherKeypair.publicKey.toBase58())
    )
    expect(transferDest.toBase58()).not.toBe(wrongUserAta.toBase58())

    // No users lookup means no wallet_address update. The only updates are
    // the claim lifecycle: claiming, claiming with signature, then claimed.
    expect(updates.some((u) => 'wallet_address' in u)).toBe(false)
  })

  it('records claimed after a successful send and confirm', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding(),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(true)
    expect(result.signature).toBeDefined()
    expect(result.already_claimed).toBe(false)
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(connection.confirmTransaction).toHaveBeenCalledTimes(1)
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'claimed',
      signature: result.signature,
      claimed_at: expect.any(String),
    })
  })

  it('sets failed when sendRawTransaction is rejected', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding(),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection({
      sendError: new Error('preflight failure'),
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe(500)
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Send rejected'),
    })
  })

  it('resumes a claiming holding when the chain shows the expected balance', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding({
        status: 'claiming',
        signature: 'landed-sig',
      }),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()
    connection.getTokenAccountBalance = vi.fn().mockResolvedValue({
      value: { amount: '1000000000' },
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(true)
    expect(result.signature).toBe('landed-sig')
    expect(result.already_claimed).toBe(true)
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'claimed',
      signature: 'landed-sig',
    })
  })

  it('reports already claimed when the chain already shows the expected balance for a claimable holding', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding({
        status: 'claimable',
        signature: 'racing-sig',
      }),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()
    connection.getTokenAccountBalance = vi.fn().mockResolvedValue({
      value: { amount: '1000000000' },
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(true)
    expect(result.signature).toBe('racing-sig')
    expect(result.already_claimed).toBe(true)
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'claimed',
      signature: 'racing-sig',
      claimed_at: expect.any(String),
    })
  })

  it('sets failed when a claiming holding does not have the expected balance', async () => {
    const { supabase, updates } = makeMockSupabase({
      holding: makeHolding({
        status: 'claiming',
        signature: 'missing-sig',
      }),
      graduation: makeGraduation(),
    })
    const connection = makeMockConnection()
    connection.getTokenAccountBalance = vi.fn().mockResolvedValue({
      value: { amount: '0' },
    })

    const result = await claimGraduationHolding('holding-1', 'user-1', {
      supabase: supabase as any,
      connection,
      platformKeypair,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe(409)
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
    expect(updates[updates.length - 1]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('0'),
    })
  })
})
