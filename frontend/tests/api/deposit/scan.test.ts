import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { scanAndSweepUserDeposits } from '@/lib/scan-user-deposits'
import { privyClient } from '@/lib/privy-server'

vi.mock('@/lib/supabaseServer', () => {
  const state = { users: [] as any[], deposits: [] as any[], balances: null as any }

  function execute(table: string, filters: any[], notNull: { col: string } | null) {
    let data: any[] = []
    if (table === 'users') data = state.users
    else if (table === 'deposits') data = state.deposits
    else if (table === 'balances') data = state.balances ? [state.balances] : []

    if (notNull) data = data.filter((r) => r[notNull.col] != null)

    for (const f of filters) {
      if (f.type === 'eq') data = data.filter((r) => r[f.col] === f.val)
      if (f.type === 'in') data = data.filter((r) => f.vals.includes(r[f.col]))
    }

    return Promise.resolve({ data, error: null })
  }

  function from(table: string) {
    const filters: any[] = []
    let notNull: { col: string } | null = null

    const builder: any = {
      select: () => builder,
      not: (col: string) => { notNull = { col }; return builder },
      eq: (col: string, val: any) => { filters.push({ type: 'eq', col, val }); return builder },
      in: (col: string, vals: any[]) => { filters.push({ type: 'in', col, vals }); return builder },
      single: () => execute(table, filters, notNull).then((r: any) => ({ data: r.data[0] ?? null, error: null })),
      then: (onF: any, onR: any) => execute(table, filters, notNull).then(onF, onR),
    }
    return builder
  }

  const rpc = vi.fn(async (name: string, params: any) => {
    if (name === 'record_deposit_detected') {
      state.deposits.push({
        id: crypto.randomUUID(),
        user_id: params.p_user_id,
        signature: params.p_signature,
        amount_usdc: params.p_amount_usdc,
        source_ata: params.p_source_ata,
        status: 'detected',
        sweep_signature: null,
      })
    } else if (name === 'mark_deposit_sweeping') {
      const d = state.deposits.find((x) => x.id === params.p_deposit_id)
      if (d) d.status = 'sweeping'
    } else if (name === 'mark_deposit_swept') {
      const d = state.deposits.find((x) => x.id === params.p_deposit_id)
      if (d) {
        d.status = 'swept'
        d.sweep_signature = params.p_sweep_signature
      }
    } else if (name === 'mark_deposit_awaiting_consent') {
      const d = state.deposits.find((x) => x.id === params.p_deposit_id)
      if (d) d.status = 'awaiting_consent'
    } else if (name === 'credit_swept_deposit') {
      const d = state.deposits.find((x) => x.id === params.p_deposit_id)
      if (d) {
        d.status = 'credited'
        const net = Math.max(0, Number(d.amount_usdc) - 0.02)
        state.balances = { user_id: d.user_id, available_usdc: String(net), locked_usdc: '0' }
      }
    }
    return { data: null, error: null }
  })

  return {
    supabaseAdmin: {
      resetState: () => { state.users = []; state.deposits = []; state.balances = null },
      setState: (patch: any) => { Object.assign(state, patch) },
      from,
      rpc,
    },
  }
})

vi.mock('@/lib/privy-server', () => ({
  privyClient: {
    getUserById: vi.fn(),
    walletApi: {
      solana: {
        signTransaction: vi.fn(),
      },
    },
  },
}))

import { supabaseAdmin } from '@/lib/supabaseServer'

const mockSupabase = supabaseAdmin as any

const originalEnv: Record<string, string | undefined> = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  USDC_MINT_ADDRESS: process.env.USDC_MINT_ADDRESS,
  PLATFORM_SOLANA_ADDRESS: process.env.PLATFORM_SOLANA_ADDRESS,
  PLATFORM_WALLET_PRIVATE_KEY: process.env.PLATFORM_WALLET_PRIVATE_KEY,
}

const testSignature = crypto.randomUUID()

function makeFakeConnection(parsedTx: any) {
  return {
    getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: testSignature, err: null }]),
    getParsedTransaction: vi.fn().mockResolvedValue(parsedTx),
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: bs58.encode(Buffer.alloc(32)), lastValidBlockHeight: 0 }),
    sendRawTransaction: vi.fn().mockResolvedValue('sweep-sig-1'),
    confirmTransaction: vi.fn().mockResolvedValue({}),
  } as unknown as Connection
}

describe('scanAndSweepUserDeposits', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSupabase.resetState()
    vi.mocked(privyClient.getUserById).mockResolvedValue({
      linkedAccounts: [],
    } as any)
    vi.mocked(privyClient.walletApi.solana.signTransaction).mockResolvedValue({
      signedTransaction: {
        serialize: () => Buffer.from('fake-serialized-tx'),
      },
    } as any)
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  it('scans the same incoming transfer twice and produces one deposit and one credit', async () => {
    const owner = Keypair.generate()
    const platformOwner = Keypair.generate()
    const sourceOwner = Keypair.generate()
    const usdcMint = Keypair.generate().publicKey
    const user = { id: 'user-1', privy_id: 'did:privy:test', custodial_wallet_address: owner.publicKey.toBase58() }

    mockSupabase.setState({ users: [user] })

    process.env.SOLANA_RPC_URL = 'http://localhost:8899'
    process.env.USDC_MINT_ADDRESS = usdcMint.toBase58()
    process.env.PLATFORM_SOLANA_ADDRESS = platformOwner.publicKey.toBase58()
    process.env.PLATFORM_WALLET_PRIVATE_KEY = bs58.encode(platformOwner.secretKey)

    const userAta = await getAssociatedTokenAddress(usdcMint, owner.publicKey)
    const sourceAta = await getAssociatedTokenAddress(usdcMint, sourceOwner.publicKey)

    const parsedTx = {
      transaction: {
        message: {
          instructions: [
            {
              programId: TOKEN_PROGRAM_ID,
              parsed: {
                type: 'transferChecked',
                info: {
                  mint: usdcMint.toBase58(),
                  destination: userAta.toBase58(),
                  source: sourceAta.toBase58(),
                  tokenAmount: { amount: '5000000' },
                },
              },
            },
          ],
        },
      },
    }

    const privyWalletId = 'wallet-id-1'
    vi.mocked(privyClient.getUserById).mockResolvedValue({
      linkedAccounts: [
        { type: 'wallet', address: owner.publicKey.toBase58(), delegated: true, id: privyWalletId },
      ],
    } as any)

    const fakeConnection = makeFakeConnection(parsedTx)

    await scanAndSweepUserDeposits(user.id, fakeConnection)

    const { data: deposits } = await mockSupabase.from('deposits').select('*').eq('user_id', user.id)
    expect(deposits).toHaveLength(1)
    expect(deposits![0].signature).toBe(testSignature)
    expect(deposits![0].status).toBe('credited')
    expect(deposits![0].sweep_signature).toBe('sweep-sig-1')

    const { data: balance } = await mockSupabase.from('balances').select('available_usdc').eq('user_id', user.id).single()
    const balanceUsdc = Number(balance!.available_usdc)
    expect(balanceUsdc).toBeGreaterThan(0)

    const recordCalls = mockSupabase.rpc.mock.calls.filter((call: any) => call[0] === 'record_deposit_detected')
    expect(recordCalls).toHaveLength(1)
    const creditCalls = mockSupabase.rpc.mock.calls.filter((call: any) => call[0] === 'credit_swept_deposit')
    expect(creditCalls).toHaveLength(1)

    await scanAndSweepUserDeposits(user.id, fakeConnection)

    const { data: depositsAfter } = await mockSupabase.from('deposits').select('*').eq('user_id', user.id)
    expect(depositsAfter).toHaveLength(1)

    const { data: balanceAfter } = await mockSupabase.from('balances').select('available_usdc').eq('user_id', user.id).single()
    expect(Number(balanceAfter!.available_usdc)).toBe(balanceUsdc)

    const recordCallsAfter = mockSupabase.rpc.mock.calls.filter((call: any) => call[0] === 'record_deposit_detected')
    expect(recordCallsAfter).toHaveLength(1)
    const creditCallsAfter = mockSupabase.rpc.mock.calls.filter((call: any) => call[0] === 'credit_swept_deposit')
    expect(creditCallsAfter).toHaveLength(1)
  })
})
