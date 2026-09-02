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
import { checkRateLimit } from '@/lib/rate-limit'

const USDC_DECIMALS = 6

type WithdrawalOutcome =
  | { kind: 'landed' }
  | { kind: 'failed' }
  | { kind: 'dropped' }
  | { kind: 'unknown'; reason: string }

async function determineWithdrawalOutcome(
  connection: Connection,
  signature: string,
  recentBlockhash: string
): Promise<WithdrawalOutcome> {
  try {
    const { value } = await connection.getSignatureStatus(signature)
    if (value) {
      if (value.err) {
        return { kind: 'failed' }
      }
      if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') {
        return { kind: 'landed' }
      }
      return {
        kind: 'unknown',
        reason: `signature ${signature} has confirmationStatus ${value.confirmationStatus}`,
      }
    }
  } catch (err: any) {
    console.error('[api/withdraw] getSignatureStatus failed:', err.message)
  }

  try {
    const { value } = await connection.isBlockhashValid(recentBlockhash)
    if (value === false) {
      return { kind: 'dropped' }
    }
  } catch (err: any) {
    console.error('[api/withdraw] isBlockhashValid failed:', err.message)
  }

  return {
    kind: 'unknown',
    reason: `signature ${signature} not found and blockhash ${recentBlockhash} is still valid`,
  }
}

async function tryFinalizeWithdrawal(
  withdrawalId: string,
  signature: string
): Promise<{ finalized: boolean; already?: boolean; error?: string }> {
  const { error: finalizeError } = await supabaseAdmin.rpc('finalize_withdrawal', {
    p_withdrawal_id: withdrawalId,
    p_signature: signature,
  })
  if (!finalizeError) {
    return { finalized: true }
  }

  // Belt-and-braces: re-read the row in case the RPC committed but the response was lost.
  const { data: row, error: rowError } = await supabaseAdmin
    .from('withdrawals')
    .select('status, signature')
    .eq('id', withdrawalId)
    .single()

  if (!rowError && (row?.status === 'finalized' || row?.signature === signature)) {
    return { finalized: true, already: true }
  }

  return { finalized: false, error: finalizeError.message }
}

async function tryRefundWithdrawal(
  withdrawalId: string
): Promise<{ refunded: boolean; reason?: string; error?: string }> {
  const { data: row, error: rowError } = await supabaseAdmin
    .from('withdrawals')
    .select('status, signature')
    .eq('id', withdrawalId)
    .single()

  if (rowError) {
    return { refunded: false, error: `re-read failed: ${rowError.message}` }
  }

  if (row?.status === 'finalized' || row?.status === 'refunded') {
    return { refunded: false, reason: `status is ${row.status}` }
  }

  const { error: refundError } = await supabaseAdmin.rpc('refund_withdrawal', {
    p_withdrawal_id: withdrawalId,
  })

  if (refundError) {
    return { refunded: false, error: refundError.message }
  }

  return { refunded: true }
}

async function markWithdrawalUnknown(
  withdrawalId: string,
  signature?: string,
  reason?: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('withdrawals')
    .update({
      status: 'unknown',
      signature: signature ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', withdrawalId)

  if (error) {
    throw new Error(`Could not mark withdrawal ${withdrawalId} as unknown: ${error.message}`)
  }

  console.log('[api/withdraw] marked unknown:', { withdrawalId, signature, reason })
}

async function validateWithdrawalAddress(
  connection: Connection,
  address: PublicKey
): Promise<string | null> {
  let account
  try {
    account = await connection.getAccountInfo(address)
  } catch (err: any) {
    console.error('[api/withdraw] getAccountInfo error:', err)
    throw new Error('Could not verify wallet address on-chain')
  }

  if (!account) {
    // A wallet that has never received funds has no on-chain account yet.
    return null
  }

  if (account.executable) {
    return 'This address is a Solana program, not a wallet. Use the wallet address your app shows as your account.'
  }

  if (account.owner.equals(TOKEN_PROGRAM_ID)) {
    return 'This looks like a USDC token account, not a wallet address. Use the wallet address your app shows as your account.'
  }

  if (!PublicKey.isOnCurve(address.toBytes())) {
    return 'This address cannot sign transactions, so it cannot receive withdrawals. Use the wallet address your app shows as your account.'
  }

  return null
}

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

    const rate = await checkRateLimit(user.id, 'withdraw')
    if (!rate.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${rate.retryAfter} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      )
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

    const connection = new Connection(rpcUrl, 'finalized')

    const validationError = await validateWithdrawalAddress(connection, recipientPubkey)
    if (validationError) {
      console.log('[api/withdraw] address validation failed:', validationError)
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Reserve the off-chain balance first, before any on-chain movement.
    const { data: reserved, error: reserveError } = await supabaseAdmin.rpc('reserve_withdrawal', {
      p_user_id: user.id,
      p_amount_usdc: amount_usdc,
      p_wallet_address: wallet_address,
    })

    if (reserveError) {
      console.error('[api/withdraw] reserve_withdrawal failed:', reserveError)
      return NextResponse.json({ error: reserveError.message }, { status: 400 })
    }

    console.log('[api/withdraw] loading platform keypair')
    const platformKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
    const platformPubkey = platformKeypair.publicKey
    const usdcMintPubkey = new PublicKey(usdcMint)

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

    let signature: string | undefined
    let recentBlockhash = ''
    try {
      console.log('[api/withdraw] sending transaction')
      const { blockhash } = await connection.getLatestBlockhash('finalized')
      transaction.recentBlockhash = blockhash
      recentBlockhash = blockhash
      signature = await connection.sendTransaction(transaction, [platformKeypair])
      await connection.confirmTransaction(signature, 'finalized')
      console.log('[api/withdraw] transaction confirmed:', signature)

      const finalizeResult = await tryFinalizeWithdrawal(reserved.withdrawal_id, signature)
      if (!finalizeResult.finalized) {
        await markWithdrawalUnknown(
          reserved.withdrawal_id,
          signature,
          finalizeResult.error ?? 'finalize failed after confirmation'
        )
        return NextResponse.json(
          { error: 'Withdrawal was sent but could not be finalized. It has been flagged for review.' },
          { status: 202 }
        )
      }
    } catch (err: any) {
      console.error('[api/withdraw] on-chain send/finalize failed:', err)

      if (!signature) {
        // sendTransaction threw before a signature was produced. Nothing can be on chain.
        const refund = await tryRefundWithdrawal(reserved.withdrawal_id)
        if (!refund.refunded) {
          await markWithdrawalUnknown(reserved.withdrawal_id, undefined, refund.error ?? refund.reason)
          return NextResponse.json(
            { error: 'Withdrawal could not be sent and has been flagged for review.' },
            { status: 202 }
          )
        }
        return NextResponse.json(
          { error: 'Withdrawal could not be sent and has been refunded' },
          { status: 500 }
        )
      }

      const outcome = await determineWithdrawalOutcome(connection, signature, recentBlockhash)

      if (outcome.kind === 'landed') {
        const finalizeResult = await tryFinalizeWithdrawal(reserved.withdrawal_id, signature)
        if (finalizeResult.finalized) {
          return NextResponse.json({
            signature,
            new_balance: reserved.new_balance,
            already: finalizeResult.already ?? false,
          })
        }
        await markWithdrawalUnknown(reserved.withdrawal_id, signature, finalizeResult.error ?? 'could not finalize landed transaction')
        return NextResponse.json(
          { error: 'Withdrawal was sent but could not be finalized. It has been flagged for review.' },
          { status: 202 }
        )
      }

      if (outcome.kind === 'failed' || outcome.kind === 'dropped') {
        const refund = await tryRefundWithdrawal(reserved.withdrawal_id)
        if (!refund.refunded) {
          await markWithdrawalUnknown(reserved.withdrawal_id, signature, refund.error ?? refund.reason)
          return NextResponse.json(
            { error: 'Withdrawal could not be refunded and has been flagged for review.' },
            { status: 202 }
          )
        }
        const reason = outcome.kind === 'failed' ? 'failed on-chain' : 'was dropped by the network'
        return NextResponse.json(
          { error: `Withdrawal ${reason} and has been refunded` },
          { status: 500 }
        )
      }

      await markWithdrawalUnknown(reserved.withdrawal_id, signature, outcome.reason)
      return NextResponse.json(
        { error: 'Withdrawal status is unknown and has been flagged for review' },
        { status: 202 }
      )
    }

    console.log('[api/withdraw] complete, new balance:', reserved.new_balance)
    return NextResponse.json({ signature, new_balance: reserved.new_balance })
  } catch (error: any) {
    console.error('[api/withdraw] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
