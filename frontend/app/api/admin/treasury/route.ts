import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 30_000
const SOL_TRANSFER_COST = 0.000005
const SOL_ATA_COST = 0.002
const LOW_TREASURY_THRESHOLD = 50

function handleAuthError(err: any) {
  if (err?.message === 'Forbidden' || err?.message === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

let cachedAt = 0
let cachedSol: number | null = null
let cachedUsdc: number | null = null

export async function GET(request: Request) {
  try {
    await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const rpcUrl = process.env.SOLANA_RPC_URL

  if (!platformAddress || !usdcMint || !rpcUrl) {
    console.error('[api/admin/treasury] missing PLATFORM_SOLANA_ADDRESS, USDC_MINT_ADDRESS, or SOLANA_RPC_URL')
    return NextResponse.json({ error: 'Treasury environment not configured' }, { status: 500 })
  }

  try {
    const now = Date.now()
    let sol: number
    let usdc: number

    if (now - cachedAt < CACHE_TTL_MS && cachedSol !== null && cachedUsdc !== null) {
      sol = cachedSol
      usdc = cachedUsdc
    } else {
      const connection = new Connection(rpcUrl)
      const platformPubkey = new PublicKey(platformAddress)

      const lamports = await connection.getBalance(platformPubkey)
      sol = lamports / 1_000_000_000

      const usdcMintPubkey = new PublicKey(usdcMint)
      const platformAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)
      const usdcBalance = await connection.getTokenAccountBalance(platformAta)
      usdc = usdcBalance.value.uiAmount ?? 0

      cachedSol = sol
      cachedUsdc = usdc
      cachedAt = now
    }

    const { data: liability, error: liabilityError } = await supabaseAdmin
      .from('ledger_liability')
      .select('backed_liability_exact')
      .single()

    if (liabilityError) {
      console.error('[api/admin/treasury] liability query error:', liabilityError)
      return NextResponse.json({ error: 'Failed to load ledger liability' }, { status: 500 })
    }

    const expensiveTransfers = Math.floor(sol / SOL_ATA_COST)

    return NextResponse.json({
      sol,
      usdc,
      backed_liability: (liability?.backed_liability_exact ?? '0'),
      cheap_transfers: Math.floor(sol / SOL_TRANSFER_COST),
      expensive_transfers: expensiveTransfers,
      low: expensiveTransfers < LOW_TREASURY_THRESHOLD,
    })
  } catch (err: any) {
    console.error('[api/admin/treasury] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Treasury RPC call failed' },
      { status: 500 }
    )
  }
}
