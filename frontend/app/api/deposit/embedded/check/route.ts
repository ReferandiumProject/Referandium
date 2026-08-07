import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

const USDC_DECIMALS = 6
const RECENT_SIGNATURES_LIMIT = 20

export async function POST(request: Request) {
  console.log('[api/deposit/embedded/check] received request')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/deposit/embedded/check] authenticated user:', user.id)
    } catch {
      console.log('[api/deposit/embedded/check] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    const usdcMint = process.env.USDC_MINT_ADDRESS
    if (!rpcUrl || !usdcMint) {
      console.error('[api/deposit/embedded/check] missing SOLANA_RPC_URL or USDC_MINT_ADDRESS env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('custodial_wallet_address')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.custodial_wallet_address) {
      console.error('[api/deposit/embedded/check] user fetch failed:', userError)
      return NextResponse.json({ error: 'No custodial wallet address found' }, { status: 400 })
    }

    const connection = new Connection(rpcUrl, 'finalized')
    const usdcMintPubkey = new PublicKey(usdcMint)
    const custodialPubkey = new PublicKey(userData.custodial_wallet_address)
    const userAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
    console.log('[api/deposit/embedded/check] user ATA:', userAta.toBase58())

    const signatures = await connection.getSignaturesForAddress(userAta, {
      limit: RECENT_SIGNATURES_LIMIT,
    })
    console.log(`[api/deposit/embedded/check] found ${signatures.length} signatures`)

    if (signatures.length === 0) {
      return NextResponse.json({ detected: [] })
    }

    const sigStrings = signatures.map((s) => s.signature)

    const { data: existingRows } = await supabaseAdmin
      .from('deposits')
      .select('signature')
      .in('signature', sigStrings)

    const existing = new Set((existingRows || []).map((r: any) => r.signature))
    console.log(`[api/deposit/embedded/check] ${existing.size} already recorded`)

    const newlyDetected: Array<{ id: string; amount: number; signature: string }> = []

    await Promise.all(
      signatures.map(async ({ signature, err }) => {
        if (err || existing.has(signature)) return

        const parsedTx = await connection.getParsedTransaction(signature, {
          commitment: 'finalized',
          maxSupportedTransactionVersion: 0,
        })

        if (!parsedTx) return

        let amount = 0
        let sourceAta: string | null = null

        for (const ix of parsedTx.transaction.message.instructions) {
          const parsed = (ix as any).parsed
          if (!parsed) continue
          if (!ix.programId.equals(TOKEN_PROGRAM_ID)) continue
          if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') continue

          const info = parsed.info
          if (!info) continue

          const destination = info.destination
          if (destination !== userAta.toBase58()) continue

          if (parsed.type === 'transferChecked') {
            if (info.mint !== usdcMint) continue
            const raw = info.tokenAmount?.amount
            if (raw) {
              amount += Number(raw) / 10 ** USDC_DECIMALS
              if (sourceAta === null) sourceAta = info.source
            }
          } else {
            const raw = info.amount
            if (raw) {
              amount += Number(raw) / 10 ** USDC_DECIMALS
              if (sourceAta === null) sourceAta = info.source
            }
          }
        }

        if (amount <= 0 || !sourceAta) return

        const { data, error } = await supabaseAdmin.rpc('record_deposit_detected', {
          p_user_id: user.id,
          p_signature: signature,
          p_amount_usdc: amount,
          p_source_ata: sourceAta,
        })

        if (error) {
          const isUniqueViolation =
            error.code === '23505' ||
            (typeof error.message === 'string' && error.message.includes('deposits_signature_key'))

          if (isUniqueViolation) {
            console.log('[api/deposit/embedded/check] already recorded by another process:', signature)
            return
          }

          console.error('[api/deposit/embedded/check] record_deposit_detected failed:', error)
          return
        }

        newlyDetected.push({
          id: data.id,
          amount,
          signature,
        })
      })
    )

    console.log(`[api/deposit/embedded/check] newly detected: ${newlyDetected.length}`)
    return NextResponse.json({ detected: newlyDetected })
  } catch (error: any) {
    console.error('[api/deposit/embedded/check] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
