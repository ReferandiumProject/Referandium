import { NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { privyClient } from '@/lib/privy-server'

const USDC_DECIMALS = 6
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'

export async function POST(request: Request) {
  console.log('[api/deposit/embedded/sweep] received request')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/deposit/embedded/sweep] authenticated user:', user.id)
    } catch {
      console.log('[api/deposit/embedded/sweep] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { deposit_id } = await request.json()
    if (!deposit_id || typeof deposit_id !== 'string') {
      return NextResponse.json({ error: 'deposit_id is required' }, { status: 400 })
    }

    const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY
    const rpcUrl = process.env.SOLANA_RPC_URL
    const usdcMint = process.env.USDC_MINT_ADDRESS
    const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS

    if (!privateKeyBase58 || !rpcUrl || !usdcMint || !platformAddress) {
      console.error('[api/deposit/embedded/sweep] missing required env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { data: deposit, error: depositError } = await supabaseAdmin
      .from('deposits')
      .select('*')
      .eq('id', deposit_id)
      .single()

    if (depositError || !deposit) {
      console.error('[api/deposit/embedded/sweep] deposit lookup failed:', depositError)
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 })
    }

    if (deposit.user_id !== user.id) {
      return NextResponse.json({ error: 'Deposit does not belong to this user' }, { status: 403 })
    }

    if (deposit.status !== 'detected') {
      return NextResponse.json({ error: `Deposit is not in detected status (current: ${deposit.status})` }, { status: 400 })
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('custodial_wallet_address')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.custodial_wallet_address) {
      console.error('[api/deposit/embedded/sweep] user fetch failed:', userError)
      return NextResponse.json({ error: 'No custodial wallet address found' }, { status: 400 })
    }

    const custodialWalletAddress = userData.custodial_wallet_address

    // Server-side delegation check: the custodial wallet must be delegated in Privy.
    let privyUser
    try {
      privyUser = await privyClient.getUserById(user.privy_id)
    } catch (err) {
      console.error('[api/deposit/embedded/sweep] Privy user lookup failed:', err)
      return NextResponse.json({ error: 'Unable to verify wallet delegation' }, { status: 500 })
    }

    const walletAccount = privyUser.linkedAccounts.find(
      (a: any) => a.type === 'wallet' && a.address === custodialWalletAddress
    ) as any

    if (!walletAccount || walletAccount.delegated !== true || typeof walletAccount.id !== 'string') {
      console.log('[api/deposit/embedded/sweep] wallet not delegated')
      return NextResponse.json(
        { error: 'Automatic deposits are not enabled for this wallet. Please enable them first.' },
        { status: 400 }
      )
    }

    const connection = new Connection(rpcUrl, 'finalized')
    const platformKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
    const platformPubkey = platformKeypair.publicKey
    const usdcMintPubkey = new PublicKey(usdcMint)
    const custodialPubkey = new PublicKey(custodialWalletAddress)

    const sourceAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
    const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, new PublicKey(platformAddress))

    console.log('[api/deposit/embedded/sweep] source ATA:', sourceAta.toBase58())
    console.log('[api/deposit/embedded/sweep] treasury ATA:', treasuryAta.toBase58())

    const amountUsdc = Number(deposit.amount_usdc)
    const amountRaw = BigInt(Math.floor(amountUsdc * 10 ** USDC_DECIMALS))

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
      console.error('[api/deposit/embedded/sweep] Privy sign failed:', signErr)
      return NextResponse.json({ error: signErr.message || 'Failed to sign sweep transaction' }, { status: 400 })
    }

    let sweepSignature: string
    try {
      const serialized = signedTransaction.serialize()
      sweepSignature = await connection.sendRawTransaction(serialized)
      console.log('[api/deposit/embedded/sweep] sweep sent:', sweepSignature)
      await connection.confirmTransaction(sweepSignature, 'finalized')
      console.log('[api/deposit/embedded/sweep] sweep confirmed')
    } catch (sweepErr: any) {
      console.error('[api/deposit/embedded/sweep] send or confirm failed:', sweepErr)
      await supabaseAdmin.rpc('mark_deposit_failed', { p_deposit_id: deposit_id })
      return NextResponse.json(
        { error: 'Sweep transaction failed and has been marked failed' },
        { status: 500 }
      )
    }

    const { error: markError } = await supabaseAdmin.rpc('mark_deposit_swept', {
      p_deposit_id: deposit_id,
      p_sweep_signature: sweepSignature,
    })

    if (markError) {
      console.error('[api/deposit/embedded/sweep] mark_deposit_swept failed:', markError)
      return NextResponse.json({ error: markError.message }, { status: 500 })
    }

    const { data, error: creditError } = await supabaseAdmin.rpc('credit_swept_deposit', {
      p_deposit_id: deposit_id,
    })

    if (creditError) {
      console.error('[api/deposit/embedded/sweep] credit_swept_deposit failed:', creditError)
      return NextResponse.json({ error: creditError.message }, { status: 500 })
    }

    return NextResponse.json({
      new_balance: data.new_balance,
      credited_amount: data.credited_amount,
    })
  } catch (error: any) {
    console.error('[api/deposit/embedded/sweep] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
