import { describe, it, expect, vi } from 'vitest'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { scanAndSweepUserDeposits } from '@/lib/scan-user-deposits'
import { privyClient } from '@/lib/privy-server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser } from '../startup-votes/fixtures'

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

const originalEnv: Record<string, string | undefined> = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  USDC_MINT_ADDRESS: process.env.USDC_MINT_ADDRESS,
  PLATFORM_SOLANA_ADDRESS: process.env.PLATFORM_SOLANA_ADDRESS,
  PLATFORM_WALLET_PRIVATE_KEY: process.env.PLATFORM_WALLET_PRIVATE_KEY,
}

function makeFakeConnection(options: {
  parsedTx: any
  signatures: Array<{ signature: string; err?: any; blockTime: number }>
  balance?: string
}) {
  const tokenBalance = options.balance ?? '5000000'
  return {
    getSignaturesForAddress: vi.fn().mockResolvedValue(options.signatures),
    getParsedTransaction: vi.fn().mockResolvedValue(options.parsedTx),
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: bs58.encode(Buffer.alloc(32)),
      lastValidBlockHeight: 0,
    }),
    sendRawTransaction: vi.fn().mockResolvedValue('sweep-sig-1'),
    confirmTransaction: vi.fn().mockResolvedValue({}),
    getTokenAccountBalance: vi.fn().mockResolvedValue({
      value: { amount: tokenBalance, decimals: USDC_DECIMALS },
    }),
    getSignatureStatus: vi.fn().mockResolvedValue({ value: null }),
  } as unknown as Connection
}

const USDC_DECIMALS = 6

describe('scanAndSweepUserDeposits', () => {
  it('scans the same incoming transfer twice and produces one deposit and one credit', async () => {
    const user = await createFixtureUser()
    const owner = Keypair.generate()
    const platformOwner = Keypair.generate()
    const sourceOwner = Keypair.generate()
    const usdcMint = Keypair.generate().publicKey

    const deposits: any[] = []

    await supabaseAdmin.from('users').update({
      custodial_wallet_address: owner.publicKey.toBase58(),
      deposits_scanned_from: new Date(Date.now() - 86400000).toISOString(),
    }).eq('id', user.id)

    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '0',
      locked_usdc: '0',
    })

    process.env.SOLANA_RPC_URL = 'http://localhost:8899'
    process.env.USDC_MINT_ADDRESS = usdcMint.toBase58()
    process.env.PLATFORM_SOLANA_ADDRESS = platformOwner.publicKey.toBase58()
    process.env.PLATFORM_WALLET_PRIVATE_KEY = bs58.encode(platformOwner.secretKey)

    const userAta = await getAssociatedTokenAddress(usdcMint, owner.publicKey)
    const sourceAta = await getAssociatedTokenAddress(usdcMint, sourceOwner.publicKey)
    const testSignature = crypto.randomUUID()

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

    vi.mocked(privyClient.getUserById).mockResolvedValue({
      linkedAccounts: [
        {
          type: 'wallet',
          address: owner.publicKey.toBase58(),
          delegated: true,
          id: 'wallet-id-1',
        },
      ],
    } as any)

    vi.mocked(privyClient.walletApi.solana.signTransaction).mockResolvedValue({
      signedTransaction: {
        serialize: () => Buffer.from('fake-serialized-tx'),
      },
    } as any)

    const fakeConnection = makeFakeConnection({
      parsedTx,
      signatures: [{ signature: testSignature, err: null, blockTime: Math.floor(Date.now() / 1000) }],
    })

    function makeDepositsBuilder() {
      const filters: any[] = []
      let updateVals: any = null

      const builder: any = {
        select: () => builder,
        update: (vals: any) => {
          updateVals = vals
          return builder
        },
        eq: (col: string, val: any) => {
          filters.push({ type: 'eq', col, val })
          return builder
        },
        in: (col: string, vals: any[]) => {
          filters.push({ type: 'in', col, vals })
          return builder
        },
        then: (onF: any, onR: any) => {
          let data = deposits
          for (const f of filters) {
            if (f.type === 'eq') data = data.filter((r) => r[f.col] === f.val)
            if (f.type === 'in') data = data.filter((r) => f.vals.includes(r[f.col]))
          }
          if (updateVals) {
            data.forEach((r) => Object.assign(r, updateVals))
          }
          return Promise.resolve({ data, error: null }).then(onF, onR)
        },
      }
      return builder
    }

    const originalFrom = (supabaseAdmin as any).from
    const originalRpc = (supabaseAdmin as any).rpc

    const fromSpy = vi.spyOn(supabaseAdmin as any, 'from').mockImplementation((table: any) => {
      if (table === 'deposits') return makeDepositsBuilder()
      return originalFrom.call(supabaseAdmin, table)
    })

    const rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
      if (name === 'record_deposit_detected') {
        const deposit = {
          id: crypto.randomUUID(),
          user_id: params.p_user_id,
          signature: params.p_signature,
          amount_usdc: params.p_amount_usdc,
          source_ata: params.p_source_ata,
          status: 'detected',
          sweep_signature: null,
        }
        deposits.push(deposit)
        return { data: { id: deposit.id }, error: null }
      }
      if (name === 'mark_deposit_pre_cutoff') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'pre_cutoff'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_sweeping') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'sweeping'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_swept') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) {
          d.status = 'swept'
          d.sweep_signature = params.p_sweep_signature
        }
        return { data: null, error: null }
      }
      if (name === 'credit_swept_deposit') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'credited'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_awaiting_consent') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'awaiting_consent'
        return { data: null, error: null }
      }
      return originalRpc.call(supabaseAdmin, name, params)
    })

    try {
      await scanAndSweepUserDeposits(user.id, fakeConnection)

      const recordCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'record_deposit_detected')
      const creditCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'credit_swept_deposit')

      expect(recordCalls).toHaveLength(1)
      expect(creditCalls).toHaveLength(1)
      expect(deposits).toHaveLength(1)
      expect(deposits[0].signature).toBe(testSignature)
      expect(deposits[0].status).toBe('credited')
      expect(deposits[0].sweep_signature).toBe('sweep-sig-1')

      await scanAndSweepUserDeposits(user.id, fakeConnection)

      const recordCallsAfter = rpcSpy.mock.calls.filter((call: any) => call[0] === 'record_deposit_detected')
      const creditCallsAfter = rpcSpy.mock.calls.filter((call: any) => call[0] === 'credit_swept_deposit')

      expect(recordCallsAfter).toHaveLength(1)
      expect(creditCallsAfter).toHaveLength(1)
      expect(deposits).toHaveLength(1)
    } finally {
      fromSpy.mockRestore()
      rpcSpy.mockRestore()
      await supabaseAdmin.from('balances').delete().eq('user_id', user.id)
      await supabaseAdmin.from('users').delete().eq('id', user.id)

      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it('ignores transfers whose source is the platform treasury', async () => {
    const user = await createFixtureUser()
    const owner = Keypair.generate()
    const platformOwner = Keypair.generate()
    const usdcMint = Keypair.generate().publicKey

    const deposits: any[] = []

    await supabaseAdmin.from('users').update({
      custodial_wallet_address: owner.publicKey.toBase58(),
      deposits_scanned_from: new Date(Date.now() - 86400000).toISOString(),
    }).eq('id', user.id)

    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '0',
      locked_usdc: '0',
    })

    process.env.SOLANA_RPC_URL = 'http://localhost:8899'
    process.env.USDC_MINT_ADDRESS = usdcMint.toBase58()
    process.env.PLATFORM_SOLANA_ADDRESS = platformOwner.publicKey.toBase58()
    process.env.PLATFORM_WALLET_PRIVATE_KEY = bs58.encode(platformOwner.secretKey)

    const userAta = await getAssociatedTokenAddress(usdcMint, owner.publicKey)
    const treasuryAta = await getAssociatedTokenAddress(usdcMint, platformOwner.publicKey)
    const testSignature = crypto.randomUUID()

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
                  source: treasuryAta.toBase58(),
                  tokenAmount: { amount: '5000000' },
                },
              },
            },
          ],
        },
      },
    }

    vi.mocked(privyClient.getUserById).mockResolvedValue({
      linkedAccounts: [
        {
          type: 'wallet',
          address: owner.publicKey.toBase58(),
          delegated: true,
          id: 'wallet-id-1',
        },
      ],
    } as any)

    vi.mocked(privyClient.walletApi.solana.signTransaction).mockResolvedValue({
      signedTransaction: {
        serialize: () => Buffer.from('fake-serialized-tx'),
      },
    } as any)

    const fakeConnection = makeFakeConnection({
      parsedTx,
      signatures: [{ signature: testSignature, err: null, blockTime: Math.floor(Date.now() / 1000) }],
    })

    function makeDepositsBuilder() {
      const filters: any[] = []
      let updateVals: any = null

      const builder: any = {
        select: () => builder,
        update: (vals: any) => {
          updateVals = vals
          return builder
        },
        eq: (col: string, val: any) => {
          filters.push({ type: 'eq', col, val })
          return builder
        },
        in: (col: string, vals: any[]) => {
          filters.push({ type: 'in', col, vals })
          return builder
        },
        then: (onF: any, onR: any) => {
          let data = deposits
          for (const f of filters) {
            if (f.type === 'eq') data = data.filter((r) => r[f.col] === f.val)
            if (f.type === 'in') data = data.filter((r) => f.vals.includes(r[f.col]))
          }
          if (updateVals) {
            data.forEach((r) => Object.assign(r, updateVals))
          }
          return Promise.resolve({ data, error: null }).then(onF, onR)
        },
      }
      return builder
    }

    const originalFrom = (supabaseAdmin as any).from
    const originalRpc = (supabaseAdmin as any).rpc

    const fromSpy = vi.spyOn(supabaseAdmin as any, 'from').mockImplementation((table: any) => {
      if (table === 'deposits') return makeDepositsBuilder()
      return originalFrom.call(supabaseAdmin, table)
    })

    const rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
      if (name === 'record_deposit_detected') {
        const deposit = {
          id: crypto.randomUUID(),
          user_id: params.p_user_id,
          signature: params.p_signature,
          amount_usdc: params.p_amount_usdc,
          source_ata: params.p_source_ata,
          status: 'detected',
          sweep_signature: null,
        }
        deposits.push(deposit)
        return { data: { id: deposit.id }, error: null }
      }
      if (name === 'mark_deposit_pre_cutoff') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'pre_cutoff'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_sweeping') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'sweeping'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_swept') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) {
          d.status = 'swept'
          d.sweep_signature = params.p_sweep_signature
        }
        return { data: null, error: null }
      }
      if (name === 'credit_swept_deposit') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'credited'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_awaiting_consent') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'awaiting_consent'
        return { data: null, error: null }
      }
      return originalRpc.call(supabaseAdmin, name, params)
    })

    try {
      await scanAndSweepUserDeposits(user.id, fakeConnection)

      const recordCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'record_deposit_detected')
      const creditCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'credit_swept_deposit')

      expect(recordCalls).toHaveLength(0)
      expect(creditCalls).toHaveLength(0)
      expect(deposits).toHaveLength(0)
    } finally {
      fromSpy.mockRestore()
      rpcSpy.mockRestore()
      await supabaseAdmin.from('balances').delete().eq('user_id', user.id)
      await supabaseAdmin.from('users').delete().eq('id', user.id)

      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it('records pre-cutoff transfers in pre_cutoff state and does not credit them', async () => {
    const user = await createFixtureUser()
    const owner = Keypair.generate()
    const platformOwner = Keypair.generate()
    const sourceOwner = Keypair.generate()
    const usdcMint = Keypair.generate().publicKey

    const deposits: any[] = []

    await supabaseAdmin.from('users').update({
      custodial_wallet_address: owner.publicKey.toBase58(),
      deposits_scanned_from: new Date(Date.now() - 86400000).toISOString(),
    }).eq('id', user.id)

    await supabaseAdmin.from('balances').insert({
      user_id: user.id,
      available_usdc: '0',
      locked_usdc: '0',
    })

    process.env.SOLANA_RPC_URL = 'http://localhost:8899'
    process.env.USDC_MINT_ADDRESS = usdcMint.toBase58()
    process.env.PLATFORM_SOLANA_ADDRESS = platformOwner.publicKey.toBase58()
    process.env.PLATFORM_WALLET_PRIVATE_KEY = bs58.encode(platformOwner.secretKey)

    const userAta = await getAssociatedTokenAddress(usdcMint, owner.publicKey)
    const sourceAta = await getAssociatedTokenAddress(usdcMint, sourceOwner.publicKey)
    const testSignature = crypto.randomUUID()

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

    vi.mocked(privyClient.getUserById).mockResolvedValue({
      linkedAccounts: [
        {
          type: 'wallet',
          address: owner.publicKey.toBase58(),
          delegated: true,
          id: 'wallet-id-1',
        },
      ],
    } as any)

    vi.mocked(privyClient.walletApi.solana.signTransaction).mockResolvedValue({
      signedTransaction: {
        serialize: () => Buffer.from('fake-serialized-tx'),
      },
    } as any)

    const fakeConnection = makeFakeConnection({
      parsedTx,
      signatures: [{ signature: testSignature, err: null, blockTime: Math.floor(Date.now() / 1000) - 172800 }],
    })

    function makeDepositsBuilder() {
      const filters: any[] = []
      let updateVals: any = null

      const builder: any = {
        select: () => builder,
        update: (vals: any) => {
          updateVals = vals
          return builder
        },
        eq: (col: string, val: any) => {
          filters.push({ type: 'eq', col, val })
          return builder
        },
        in: (col: string, vals: any[]) => {
          filters.push({ type: 'in', col, vals })
          return builder
        },
        then: (onF: any, onR: any) => {
          let data = deposits
          for (const f of filters) {
            if (f.type === 'eq') data = data.filter((r) => r[f.col] === f.val)
            if (f.type === 'in') data = data.filter((r) => f.vals.includes(r[f.col]))
          }
          if (updateVals) {
            data.forEach((r) => Object.assign(r, updateVals))
          }
          return Promise.resolve({ data, error: null }).then(onF, onR)
        },
      }
      return builder
    }

    const originalFrom = (supabaseAdmin as any).from
    const originalRpc = (supabaseAdmin as any).rpc

    const fromSpy = vi.spyOn(supabaseAdmin as any, 'from').mockImplementation((table: any) => {
      if (table === 'deposits') return makeDepositsBuilder()
      return originalFrom.call(supabaseAdmin, table)
    })

    const rpcSpy = vi.spyOn(supabaseAdmin as any, 'rpc').mockImplementation(async (name: any, params?: any) => {
      if (name === 'record_deposit_detected') {
        const deposit = {
          id: crypto.randomUUID(),
          user_id: params.p_user_id,
          signature: params.p_signature,
          amount_usdc: params.p_amount_usdc,
          source_ata: params.p_source_ata,
          status: 'detected',
          sweep_signature: null,
        }
        deposits.push(deposit)
        return { data: { id: deposit.id }, error: null }
      }
      if (name === 'mark_deposit_pre_cutoff') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'pre_cutoff'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_sweeping') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'sweeping'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_swept') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) {
          d.status = 'swept'
          d.sweep_signature = params.p_sweep_signature
        }
        return { data: null, error: null }
      }
      if (name === 'credit_swept_deposit') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'credited'
        return { data: null, error: null }
      }
      if (name === 'mark_deposit_awaiting_consent') {
        const d = deposits.find((x) => x.id === params.p_deposit_id)
        if (d) d.status = 'awaiting_consent'
        return { data: null, error: null }
      }
      return originalRpc.call(supabaseAdmin, name, params)
    })

    try {
      await scanAndSweepUserDeposits(user.id, fakeConnection)

      const recordCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'record_deposit_detected')
      const preCutoffCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'mark_deposit_pre_cutoff')
      const creditCalls = rpcSpy.mock.calls.filter((call: any) => call[0] === 'credit_swept_deposit')

      expect(recordCalls).toHaveLength(1)
      expect(preCutoffCalls).toHaveLength(1)
      expect(creditCalls).toHaveLength(0)
      expect(deposits).toHaveLength(1)
      expect(deposits[0].status).toBe('pre_cutoff')
    } finally {
      fromSpy.mockRestore()
      rpcSpy.mockRestore()
      await supabaseAdmin.from('balances').delete().eq('user_id', user.id)
      await supabaseAdmin.from('users').delete().eq('id', user.id)

      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })
})
