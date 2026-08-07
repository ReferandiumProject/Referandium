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

    // Look up the user's wallet addresses and compute their possible USDC ATAs.
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('wallet_address, custodial_wallet_address, connected_wallet_address')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      console.error('[api/deposit] user lookup failed:', userError)
      return NextResponse.json({ error: 'Unable to fetch user' }, { status: 500 })
    }

    const userAddresses = [
      userData.wallet_address,
      userData.custodial_wallet_address,
      userData.connected_wallet_address,
    ].filter((addr): addr is string => typeof addr === 'string' && addr.length > 0)

    const userAtaSet = new Set<string>()
    await Promise.all(
      userAddresses.map(async (addr) => {
        try {
          const pubkey = new PublicKey(addr)
          const ata = await getAssociatedTokenAddress(usdcMintPubkey, pubkey)
          userAtaSet.add(ata.toBase58())
        } catch {
          // Skip invalid addresses
        }
      })
    )

    console.log('[api/deposit] user ATAs:', Array.from(userAtaSet))

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
    let matchedSourceAta: string | null = null

    for (const ix of parsedTx.transaction.message.instructions) {
      const parsed = (ix as any).parsed
      if (!parsed) continue
      if (!ix.programId.equals(TOKEN_PROGRAM_ID)) continue
      if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') continue

      const info = parsed.info
      if (!info) continue

      const destination = info.destination
      if (destination !== platformAta.toBase58()) continue

      const source = info.source
      if (typeof source !== 'string' || !userAtaSet.has(source)) continue
      if (matchedSourceAta === null) {
        matchedSourceAta = source
      }

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

    if (!matchedSourceAta) {
      console.log('[api/deposit] no matching user source ATA found')
      return NextResponse.json({ error: 'No USDC transfer from your wallet found in transaction' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('confirm_deposit', {
      p_user_id: user.id,
      p_signature: signature,
      p_amount_usdc: creditedAmount,
      p_source_ata: matchedSourceAta,
    })

    if (error) {
      const isUniqueViolation =
        error.code === '23505' ||
        (typeof error.message === 'string' && error.message.includes('deposits_signature_key'))

      if (isUniqueViolation) {
        console.log('[api/deposit] duplicate signature detected')
        return NextResponse.json({ error: 'This deposit has already been credited' }, { status: 400 })
      }

      console.error('[api/deposit] confirm_deposit RPC failed:', error)
      return NextResponse.json({ error: 'Unable to update balance' }, { status: 500 })
    }

    console.log('[api/deposit] deposit confirmed, new balance:', data.new_balance)
    return NextResponse.json({ credited_amount: creditedAmount, new_balance: data.new_balance })
  } catch (error: any) {
    console.error('[api/deposit] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
