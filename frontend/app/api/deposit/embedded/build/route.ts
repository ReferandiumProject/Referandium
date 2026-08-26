import { NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

const USDC_DECIMALS = 6
const NETWORK_FEE_USDC = 0.02
const MINIMUM_DEPOSIT_USDC = 1.0

function base64FromUint8Array(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export async function POST(request: Request) {
  console.log('[api/deposit/embedded/build] request')

  let user
  try {
    user = await getAuthenticatedUser(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { amount_usdc } = body ?? {}

  if (typeof amount_usdc !== 'number' || Number.isNaN(amount_usdc) || amount_usdc <= 0) {
    return NextResponse.json({ error: 'amount_usdc must be a positive number' }, { status: 400 })
  }

  if (amount_usdc < MINIMUM_DEPOSIT_USDC + NETWORK_FEE_USDC) {
    return NextResponse.json(
      {
        error: `Minimum deposit is ${MINIMUM_DEPOSIT_USDC} USDC. Enter at least ${(
          MINIMUM_DEPOSIT_USDC + NETWORK_FEE_USDC
        ).toFixed(2)} USDC to cover the ${NETWORK_FEE_USDC} USDC network fee.`,
      },
      { status: 400 }
    )
  }

  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY
  const rpcUrl = process.env.SOLANA_RPC_URL
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS

  if (!privateKeyBase58 || !rpcUrl || !usdcMint || !platformAddress) {
    console.error('[api/deposit/embedded/build] missing required env vars')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (!user.custodial_wallet_address) {
    return NextResponse.json({ error: 'No custodial wallet address for this user' }, { status: 400 })
  }

  try {
    const connection = new Connection(rpcUrl, 'finalized')
    const platformKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
    const usdcMintPubkey = new PublicKey(usdcMint)
    const custodialPubkey = new PublicKey(user.custodial_wallet_address)

    const sourceAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
    const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, platformKeypair.publicKey)

    const netUsdc = amount_usdc - NETWORK_FEE_USDC
    const amountRaw = BigInt(Math.floor(netUsdc * 10 ** USDC_DECIMALS))

    if (amountRaw <= BigInt(0)) {
      return NextResponse.json({ error: 'Deposit amount too small after fee' }, { status: 400 })
    }

    let sourceBalanceRaw: bigint
    try {
      const balance = await connection.getTokenAccountBalance(sourceAta, 'finalized')
      if (!balance?.value?.amount) {
        return NextResponse.json({ error: 'Unable to read source USDC balance' }, { status: 500 })
      }
      sourceBalanceRaw = BigInt(balance.value.amount)
    } catch (err: any) {
      console.error('[api/deposit/embedded/build] balance read failed:', err)
      return NextResponse.json(
        { error: 'Unable to read source USDC balance. Ensure the token account exists and has USDC.' },
        { status: 400 }
      )
    }

    if (sourceBalanceRaw < amountRaw) {
      return NextResponse.json(
        { error: 'Insufficient USDC in embedded wallet' },
        { status: 400 }
      )
    }

    const transaction = new Transaction()
    transaction.add(createTransferInstruction(sourceAta, treasuryAta, custodialPubkey, amountRaw))

    const { blockhash } = await connection.getLatestBlockhash('finalized')
    transaction.recentBlockhash = blockhash
    transaction.feePayer = platformKeypair.publicKey

    transaction.partialSign(platformKeypair)

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })

    return NextResponse.json({
      serialized: base64FromUint8Array(serialized),
      fee_usdc: NETWORK_FEE_USDC,
      net_usdc: netUsdc,
      blockhash,
      source_ata: sourceAta.toBase58(),
      treasury_ata: treasuryAta.toBase58(),
    })
  } catch (error: any) {
    console.error('[api/deposit/embedded/build] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
