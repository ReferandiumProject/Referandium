import { NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

const USDC_DECIMALS = 6

export async function POST(request: Request) {
  console.log('[api/withdraw] received request')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/withdraw] authenticated user:', user.id)
    } catch {
      console.log('[api/withdraw] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount_usdc, wallet_address } = await request.json()
    console.log('[api/withdraw] amount:', amount_usdc, 'wallet:', wallet_address)

    if (!amount_usdc || typeof amount_usdc !== 'number' || amount_usdc <= 0) {
      console.log('[api/withdraw] invalid amount')
      return NextResponse.json({ error: 'amount_usdc must be greater than 0' }, { status: 400 })
    }

    let recipientPubkey: PublicKey
    try {
      recipientPubkey = new PublicKey(wallet_address)
    } catch {
      console.log('[api/withdraw] invalid wallet address')
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY
    const rpcUrl = process.env.SOLANA_RPC_URL
    const usdcMint = process.env.USDC_MINT_ADDRESS

    if (!privateKeyBase58 || !rpcUrl || !usdcMint) {
      console.error('[api/withdraw] missing PLATFORM_WALLET_PRIVATE_KEY, SOLANA_RPC_URL, or USDC_MINT_ADDRESS env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { data: balance, error: balanceError } = await supabaseAdmin
      .from('balances')
      .select('available_usdc, locked_usdc')
      .eq('user_id', user.id)
      .single()

    if (balanceError || !balance) {
      console.error('[api/withdraw] balance fetch failed:', balanceError)
      return NextResponse.json({ error: 'Unable to fetch balance' }, { status: 500 })
    }

    if (balance.available_usdc < amount_usdc) {
      console.log('[api/withdraw] insufficient balance')
      return NextResponse.json({ error: 'Insufficient available USDC' }, { status: 400 })
    }

    console.log('[api/withdraw] loading platform keypair')
    const platformKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
    const platformPubkey = platformKeypair.publicKey
    const usdcMintPubkey = new PublicKey(usdcMint)

    const connection = new Connection(rpcUrl, 'finalized')
    const platformAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)
    const recipientAta = await getAssociatedTokenAddress(usdcMintPubkey, recipientPubkey)
    const amountRaw = BigInt(Math.floor(amount_usdc * 10 ** USDC_DECIMALS))

    console.log('[api/withdraw] platform ATA:', platformAta.toBase58())
    console.log('[api/withdraw] recipient ATA:', recipientAta.toBase58())

    const transaction = new Transaction()
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        platformPubkey,
        recipientAta,
        recipientPubkey,
        usdcMintPubkey,
        TOKEN_PROGRAM_ID
      )
    )
    transaction.add(
      createTransferInstruction(platformAta, recipientAta, platformPubkey, amountRaw)
    )

    console.log('[api/withdraw] sending transaction')
    const signature = await connection.sendTransaction(transaction, [platformKeypair])
    await connection.confirmTransaction(signature, 'finalized')
    console.log('[api/withdraw] transaction confirmed:', signature)

    const newAvailable = balance.available_usdc - amount_usdc
    const { data: updatedBalance, error: updateError } = await supabaseAdmin
      .from('balances')
      .update({ available_usdc: newAvailable })
      .eq('user_id', user.id)
      .select('available_usdc, locked_usdc')
      .single()

    if (updateError || !updatedBalance) {
      console.error('[api/withdraw] balance update failed:', updateError)
      return NextResponse.json({ error: 'Transaction sent but balance update failed' }, { status: 500 })
    }

    console.log('[api/withdraw] complete, new balance:', updatedBalance.available_usdc)
    return NextResponse.json({ signature, new_balance: updatedBalance.available_usdc })
  } catch (error: any) {
    console.error('[api/withdraw] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
