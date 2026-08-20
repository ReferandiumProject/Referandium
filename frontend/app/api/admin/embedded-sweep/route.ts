import { NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { getAdminUser } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { privyClient } from '@/lib/privy-server'

const USDC_DECIMALS = 6

function handleAuthError(err: any) {
  if (err?.message === 'Forbidden' || err?.message === 'forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(request: Request) {
  console.log('[api/admin/embedded-sweep] received request')

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

  const { user_id, amount_usdc, destination_address } = body ?? {}

  if (!user_id || typeof user_id !== 'string') {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY
  const rpcUrl = process.env.SOLANA_RPC_URL
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS

  if (!privateKeyBase58 || !rpcUrl || !usdcMint || !platformAddress) {
    console.error('[api/admin/embedded-sweep] missing required env vars')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, privy_id, custodial_wallet_address')
      .eq('id', user_id)
      .single()

    if (userError || !userData) {
      console.error('[api/admin/embedded-sweep] user lookup failed:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!userData.custodial_wallet_address) {
      return NextResponse.json({ error: 'No custodial wallet address for this user' }, { status: 400 })
    }

    if (!userData.privy_id) {
      return NextResponse.json({ error: 'No privy_id for this user' }, { status: 400 })
    }

    // Verify the wallet is delegated in Privy before attempting to sign.
    let privyUser
    try {
      privyUser = await privyClient.getUserById(userData.privy_id)
    } catch (err) {
      console.error('[api/admin/embedded-sweep] Privy user lookup failed:', err)
      return NextResponse.json({ error: 'Unable to verify wallet delegation' }, { status: 500 })
    }

    const walletAccount = privyUser.linkedAccounts.find(
      (a: any) => a.type === 'wallet' && a.address === userData.custodial_wallet_address
    ) as any

    if (!walletAccount || walletAccount.delegated !== true || typeof walletAccount.id !== 'string') {
      console.log('[api/admin/embedded-sweep] wallet not delegated')
      return NextResponse.json(
        {
          error:
            'Wallet is not delegated. The user must enable delegation on the profile page first.',
        },
        { status: 400 }
      )
    }

    const connection = new Connection(rpcUrl, 'finalized')
    const platformKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
    const platformPubkey = platformKeypair.publicKey
    const usdcMintPubkey = new PublicKey(usdcMint)
    const custodialPubkey = new PublicKey(userData.custodial_wallet_address)

    const destinationPubkey =
      typeof destination_address === 'string' && destination_address.trim().length > 0
        ? new PublicKey(destination_address.trim())
        : new PublicKey(platformAddress)

    const sourceAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
    const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, destinationPubkey)

    console.log('[api/admin/embedded-sweep] source ATA:', sourceAta.toBase58())
    console.log('[api/admin/embedded-sweep] treasury ATA:', treasuryAta.toBase58())

    let amountRaw: bigint
    if (typeof amount_usdc === 'number') {
      amountRaw = BigInt(Math.floor(amount_usdc * 10 ** USDC_DECIMALS))
    } else {
      const balance = await connection.getTokenAccountBalance(sourceAta, 'finalized')
      if (!balance?.value?.amount) {
        return NextResponse.json({ error: 'Unable to read source USDC balance' }, { status: 500 })
      }
      amountRaw = BigInt(balance.value.amount)
    }

    if (amountRaw <= BigInt(0)) {
      return NextResponse.json({ error: 'Nothing to sweep' }, { status: 400 })
    }

    const transaction = new Transaction()
    transaction.add(createTransferInstruction(sourceAta, treasuryAta, custodialPubkey, amountRaw))

    const { blockhash } = await connection.getLatestBlockhash('finalized')
    transaction.recentBlockhash = blockhash
    transaction.feePayer = platformPubkey

    // Sign the fee-payer side locally with the platform wallet.
    transaction.partialSign(platformKeypair)

    // Have Privy sign the source-owner (delegated embedded wallet) side.
    let signedTransaction
    try {
      const signResult = await privyClient.walletApi.solana.signTransaction({
        walletId: walletAccount.id,
        transaction,
      })
      signedTransaction = signResult.signedTransaction
    } catch (signErr: any) {
      console.error('[api/admin/embedded-sweep] Privy sign failed:', signErr)
      return NextResponse.json(
        { error: signErr.message || 'Failed to sign sweep transaction' },
        { status: 400 }
      )
    }

    let sweepSignature: string
    try {
      const serialized = signedTransaction.serialize()
      sweepSignature = await connection.sendRawTransaction(serialized)
      console.log('[api/admin/embedded-sweep] sweep sent:', sweepSignature)
      await connection.confirmTransaction(sweepSignature, 'finalized')
      console.log('[api/admin/embedded-sweep] sweep confirmed')
    } catch (sweepErr: any) {
      console.error('[api/admin/embedded-sweep] send or confirm failed:', sweepErr)
      return NextResponse.json(
        { error: 'Sweep transaction failed on-chain', detail: sweepErr.message },
        { status: 500 }
      )
    }

    const sweptUsdc = Number(amountRaw) / 10 ** USDC_DECIMALS

    return NextResponse.json({
      signature: sweepSignature,
      source_ata: sourceAta.toBase58(),
      destination_ata: treasuryAta.toBase58(),
      amount_usdc: sweptUsdc,
      fee_payer: platformPubkey.toBase58(),
      note: 'No balance was credited and no deposit row was created. This was a movement-only test.',
    })
  } catch (error: any) {
    console.error('[api/admin/embedded-sweep] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
