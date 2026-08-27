import { NextResponse } from 'next/server'
import { Connection } from '@solana/web3.js'
import { getAdminUser } from '@/lib/admin'
import { scanAndSweepUserDeposits } from '@/lib/scan-user-deposits'
import { diagnoseDepositScanForUser } from '@/lib/deposit-scan-diagnostic'

function handleAuthError(err: any) {
  if (err?.message === 'Forbidden' || err?.message === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(request: Request) {
  console.log('[api/admin/deposit-scan] received request')

  try {
    await getAdminUser(request)
  } catch (err: any) {
    return handleAuthError(err)
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { user_id } = body ?? {}
  if (!user_id || typeof user_id !== 'string') {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
  const platformPrivateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY

  if (!rpcUrl || !usdcMint || !platformAddress || !platformPrivateKey) {
    console.error('[api/admin/deposit-scan] missing required env vars')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const connection = new Connection(rpcUrl, 'finalized')
  let candidates

  try {
    candidates = await diagnoseDepositScanForUser(user_id, connection)
  } catch (err: any) {
    console.error('[api/admin/deposit-scan] diagnostic failed:', err)
    return NextResponse.json({ error: err.message || 'Diagnostic failed' }, { status: 500 })
  }

  try {
    const result = await scanAndSweepUserDeposits(user_id, connection)
    console.log('[api/admin/deposit-scan] complete:', result)
    return NextResponse.json({ result, candidates })
  } catch (err: any) {
    console.error('[api/admin/deposit-scan] scan failed:', err)
    return NextResponse.json({ result: null, candidates, error: err.message || 'Scan failed' }, { status: 500 })
  }
}
