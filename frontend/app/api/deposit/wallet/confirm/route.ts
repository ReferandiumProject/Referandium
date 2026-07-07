import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

const USDC_DECIMALS = 6

export async function POST(request: Request) {
  console.log('[api/deposit] confirm request received')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/deposit] authenticated user:', user.id)
    } catch {
      console.log('[api/deposit] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { signature } = await request.json()
    console.log('[api/deposit] confirming signature:', signature)

    if (!signature || typeof signature !== 'string') {
      console.log('[api/deposit] missing signature')
      return NextResponse.json({ error: 'signature is required' }, { status: 400 })
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      console.error('[api/deposit] missing SOLANA_RPC_URL env var')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
    const usdcMint = process.env.USDC_MINT_ADDRESS
    if (!platformAddress || !usdcMint) {
      console.error('[api/deposit] missing PLATFORM_SOLANA_ADDRESS or USDC_MINT_ADDRESS env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const connection = new Connection(rpcUrl, 'finalized')
    const platformPubkey = new PublicKey(platformAddress)
    const usdcMintPubkey = new PublicKey(usdcMint)
    const platformAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)
    console.log('[api/deposit] platform ATA:', platformAta.toBase58())

    const parsedTx = await connection.getParsedTransaction(signature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    })

    if (!parsedTx) {
      console.log('[api/deposit] transaction not found')
      return NextResponse.json({ error: 'Transaction not found' }, { status: 400 })
    }

    console.log('[api/deposit] scanning transaction instructions')
    let creditedAmount = 0

    for (const ix of parsedTx.transaction.message.instructions) {
      const parsed = (ix as any).parsed
      if (!parsed) continue
      if (!ix.programId.equals(TOKEN_PROGRAM_ID)) continue
      if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') continue

      const info = parsed.info
      if (!info) continue

      const destination = info.destination
      if (destination !== platformAta.toBase58()) continue

      if (parsed.type === 'transferChecked') {
        if (info.mint !== usdcMint) continue
        const amount = info.tokenAmount?.amount
        if (amount) {
          creditedAmount += Number(amount) / 10 ** USDC_DECIMALS
        }
      } else {
        const amount = info.amount
        if (amount) {
          creditedAmount += Number(amount) / 10 ** USDC_DECIMALS
        }
      }
    }

    if (creditedAmount <= 0) {
      console.log('[api/deposit] no USDC transfer to platform found')
      return NextResponse.json({ error: 'No USDC transfer to platform found in transaction' }, { status: 400 })
    }

    console.log('[api/deposit] credited amount:', creditedAmount)

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from('balances')
      .select('available_usdc, locked_usdc')
      .eq('user_id', user.id)
      .single()

    if (balanceError || !balance) {
      console.error('[api/deposit] balance fetch failed:', balanceError)
      return NextResponse.json({ error: 'Unable to fetch balance' }, { status: 500 })
    }

    const newAvailable = balance.available_usdc + creditedAmount
    const { data: updatedBalance, error: updateError } = await supabaseAdmin
      .from('balances')
      .update({ available_usdc: newAvailable })
      .eq('user_id', user.id)
      .select('available_usdc, locked_usdc')
      .single()

    if (updateError || !updatedBalance) {
      console.error('[api/deposit] balance update failed:', updateError)
      return NextResponse.json({ error: 'Unable to update balance' }, { status: 500 })
    }

    console.log('[api/deposit] deposit confirmed, new balance:', updatedBalance.available_usdc)
    return NextResponse.json({ credited_amount: creditedAmount, new_balance: updatedBalance.available_usdc })
  } catch (error: any) {
    console.error('[api/deposit] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
