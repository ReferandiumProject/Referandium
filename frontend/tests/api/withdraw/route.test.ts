import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest'
import { POST } from '@/app/api/withdraw/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser } from '../startup-votes/fixtures'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import crypto from 'crypto'
import bs58 from 'bs58'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

process.env.PLATFORM_WALLET_PRIVATE_KEY = bs58.encode(Keypair.generate().secretKey)
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com'
process.env.USDC_MINT_ADDRESS = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

const originalFrom = (supabaseAdmin as any).from.bind(supabaseAdmin)
const originalRpc = (supabaseAdmin as any).rpc.bind(supabaseAdmin)

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
  // Deliberately do NOT delete from withdrawals here.  Mocked tests must never
  // create real withdrawal rows, and a real DELETE on withdrawals has already
  // destroyed records by matching on wallet address.
  await supabaseAdmin.from('ledger_adjustments').delete().eq('user_id', userId)
  await supabaseAdmin.from('balances').delete().eq('user_id', userId)
  await supabaseAdmin.from('users').delete().eq('id', userId)
}

type WithdrawalStore = Record<string, any>
let withdrawalsStore: WithdrawalStore = {}

function resolveWithdrawalQuery(store: WithdrawalStore, state: any) {
  const chain = state.chain ?? []

  const filterRows = (rows: any[]) => {
    for (const c of chain) {
      if (c.method === 'eq') rows = rows.filter((r) => r[c.args[0]] === c.args[1])
      if (c.method === 'gte') rows = rows.filter((r) => r[c.args[0]] >= c.args[1])
      if (c.method === 'gt') rows = rows.filter((r) => r[c.args[0]] > c.args[1])
      if (c.method === 'lte') rows = rows.filter((r) => r[c.args[0]] <= c.args[1])
      if (c.method === 'in') rows = rows.filter((r) => c.args[1].includes(r[c.args[0]]))
    }
    return rows
  }

  if (state.update) {
    const rows = filterRows(Object.values(store))
    for (const row of rows) Object.assign(row, state.update)
    return { data: null, error: null }
  }

  if (state.delete) {
    const entries = Object.entries(store)
    const rows = filterRows(entries.map(([key, row]) => ({ ...row, __key: key })))
    for (const r of rows) delete store[r.__key]
    return { data: null, error: null }
  }

  if (state.insert) {
    const items = Array.isArray(state.insert) ? state.insert : [state.insert]
    for (const item of items) {
      const id = item.id ?? crypto.randomUUID()
      store[id] = { ...item, id }
    }
    return { data: items, error: null }
  }

  if (state.select) {
    const rows = filterRows(Object.values(store))
    const [, options] = state.select
    if (options?.head) {
      return { data: [], error: null, count: rows.length }
    }
    if (chain.some((c: any) => c.method === 'single')) {
      return { data: rows[0] ?? null, error: rows.length ? null : { message: 'not found' } }
    }
    if (chain.some((c: any) => c.method === 'maybeSingle')) {
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null }
  }

  return { data: null, error: null }
}

function mockWithdrawalsBuilder(store: WithdrawalStore, state: any = {}) {
  function build(nextState: any): any {
    const thenable = (onFulfilled?: any, onRejected?: any) => {
      return Promise.resolve(resolveWithdrawalQuery(store, nextState)).then(onFulfilled, onRejected)
    }
    return new Proxy(thenable, {
      get(_, prop: string) {
        if (prop === 'then') return thenable
        if (prop === 'catch') return (onRejected: any) => thenable(undefined, onRejected)
        return (...args: any[]) => {
          const s = { ...nextState }
          if (prop === 'select') s.select = args
          else if (prop === 'insert') s.insert = args[0]
          else if (prop === 'update') s.update = args[0]
          else if (prop === 'delete') s.delete = true
          else if (prop === 'upsert') s.upsert = args[0]
          else {
            s.chain = [...(s.chain ?? []), { method: prop, args }]
          }
          return build(s)
        }
      },
    })
  }
  return build(state)
}

async function reserveFromMockBalances(params: any) {
  const { data: balance } = await supabaseAdmin
    .from('balances')
    .select('available_usdc, locked_usdc')
    .eq('user_id', params.p_user_id)
    .single()

  const available = Number(balance?.available_usdc ?? 0)
  const locked = Number(balance?.locked_usdc ?? 0)
  const amount = Number(params.p_amount_usdc)

  if (available < amount) {
    return { data: null, error: { message: 'insufficient balance' } }
  }

  const newAvailable = available - amount
  const newLocked = locked + amount

  const { error: updateError } = await supabaseAdmin
    .from('balances')
    .update({ available_usdc: newAvailable.toString(), locked_usdc: newLocked.toString() })
    .eq('user_id', params.p_user_id)

  if (updateError) return { data: null, error: updateError }

  const id = `withdrawal-${params.p_user_id}-${crypto.randomUUID()}`
  withdrawalsStore[id] = {
    id,
    user_id: params.p_user_id,
    amount_usdc: params.p_amount_usdc,
    wallet_address: params.p_wallet_address,
    status: 'pending',
    signature: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  return { data: { withdrawal_id: id, new_balance: newAvailable }, error: null }
}

async function refundFromMockBalances(params: any) {
  const row = withdrawalsStore[params.p_withdrawal_id]
  if (!row) return { data: null, error: { message: 'withdrawal not found' } }

  const { data: balance } = await supabaseAdmin
    .from('balances')
    .select('available_usdc, locked_usdc')
    .eq('user_id', row.user_id)
    .single()

  const available = Number(balance?.available_usdc ?? 0)
  const locked = Number(balance?.locked_usdc ?? 0)
  const amount = Number(row.amount_usdc)

  const { error: updateError } = await supabaseAdmin
    .from('balances')
    .update({ available_usdc: (available + amount).toString(), locked_usdc: (locked - amount).toString() })
    .eq('user_id', row.user_id)

  if (updateError) return { data: null, error: updateError }

  row.status = 'failed'
  return { data: null, error: null }
}

describe('POST /api/withdraw', () => {
  beforeEach(() => {
    withdrawalsStore = {}
    vi.spyOn(supabaseAdmin as any, 'from').mockImplementation((table: any) => {
      if (table === 'withdrawals') return mockWithdrawalsBuilder(withdrawalsStore)
      return originalFrom(table)
    })
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('does not refund when the on-chain signature is finalized but finalize_withdrawal fails', async () => {
    const user = await createFixtureUser()
    const signature = `mock-signature-${user.id}`
    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '100',
      locked_usdc: '0',
    })

    try {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
      vi.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue(null as any)
      vi.spyOn(Connection.prototype, 'sendTransaction').mockResolvedValue(signature as any)
      vi.spyOn(Connection.prototype, 'confirmTransaction').mockRejectedValue(new Error('confirmation timeout') as any)
      vi.spyOn(Connection.prototype, 'getSignatureStatus').mockResolvedValue({
        value: { err: null, confirmationStatus: 'finalized' },
      } as any)

      const rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
        if (name === 'reserve_withdrawal') {
          return reserveFromMockBalances(params)
        }
        if (name === 'finalize_withdrawal') {
          return { data: null, error: { message: 'connection reset', code: 'XX000' } }
        }
        if (name === 'refund_withdrawal') {
          return refundFromMockBalances(params)
        }
        return originalRpc(name, params)
      })

      const res = await POST(makeRequest(user.id, 1, MOCK_WALLET))
      const body = await res.json()

      expect(res.status).toBe(202)
      expect(body.error).toMatch(/flagged for review/i)
      expect(rpcSpy).not.toHaveBeenCalledWith('refund_withdrawal', expect.anything())

      const { data: balance } = await supabaseAdmin
        .from('balances')
        .select('available_usdc')
        .eq('user_id', user.id)
        .single()

      // Balance must stay at the reserved amount; a refund would have returned it to 100.
      expect(Number(balance?.available_usdc)).toBe(99)

      const { data: withdrawal } = await supabaseAdmin
        .from('withdrawals')
        .select('status, signature')
        .eq('user_id', user.id)
        .maybeSingle()

      expect(withdrawal?.status).toBe('unknown')
      expect(withdrawal?.signature).toBe(signature)
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
          return reserveFromMockBalances(params)
        }
        if (name === 'finalize_withdrawal') {
          const row = withdrawalsStore[params.p_withdrawal_id]
          if (row) {
            row.status = 'confirmed'
            row.signature = params.p_signature
          }
          return { data: null, error: null }
        }
        if (name === 'refund_withdrawal') {
          return refundFromMockBalances(params)
        }
        return originalRpc(name, params)
      })

      const res = await POST(makeRequest(user.id, 1, MOCK_WALLET))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.signature).toBe(signature)
      expect(Number(body.new_balance)).toBe(99)
      expect(rpcSpy).toHaveBeenCalledWith('finalize_withdrawal', {
        p_withdrawal_id: expect.any(String),
        p_signature: signature,
      })
    } finally {
      vi.restoreAllMocks()
      await cleanupWithdrawalTest(user.id)
    }
  })
})
