import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

import { supabaseAdmin } from '@/lib/supabaseServer'
import { TokenAmount } from '@/lib/token-amount'

const TOKEN_DECIMALS = 6

const CLAIMABLE_GRADUATION_STATUSES = [
  'minted',
  'pooling',
  'pooled',
  'burning',
  'burned',
  'paying_founder',
  'founder_paid',
  'revoking',
  'complete',
]

export interface ClaimHoldingRow {
  id: string
  graduation_id: string
  user_id: string
  wallet_address: string | null
  tokens_onchain: string
  status: string
  signature: string | null
  error: string | null
  claimed_at: string | null
}

export interface GraduationClaimRow {
  mint_address: string
  escrow_address: string
  status: string
}

export interface ClaimDeps {
  supabase?: typeof supabaseAdmin
  connection?: Connection
  platformKeypair?: Keypair
}

export type ClaimResult = {
  success: boolean
  signature?: string
  error?: string
  status?: number
}

function assertEnv(): { connection: Connection; platformKeypair: Keypair } {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY

  if (!rpcUrl || !privateKeyBase58) {
    throw new Error(
      'Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars'
    )
  }

  return {
    connection: new Connection(rpcUrl, 'finalized'),
    platformKeypair: Keypair.fromSecretKey(bs58.decode(privateKeyBase58)),
  }
}

export async function claimGraduationHolding(
  holdingId: string,
  userId: string,
  deps: ClaimDeps = {}
): Promise<ClaimResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()
  const platformPubkey = platformKeypair.publicKey

  const { data: rawHolding, error: holdingError } = await supabase
    .from('graduation_holders')
    .select(
      'id, graduation_id, user_id, wallet_address, tokens_onchain::text, status, signature, error, claimed_at'
    )
    .eq('id', holdingId)
    .single()

  if (holdingError || !rawHolding) {
    return {
      success: false,
      error: holdingError?.message ?? 'Holding not found',
      status: 404,
    }
  }

  const holding = rawHolding as unknown as ClaimHoldingRow

  if (holding.user_id !== userId) {
    return {
      success: false,
      error: 'This holding does not belong to the authenticated user',
      status: 403,
    }
  }

  if (holding.status === 'dust_zero') {
    return {
      success: false,
      error:
        'Your holding was below the smallest on-chain unit and cannot be claimed as a token',
      status: 400,
    }
  }

  if (holding.status === 'claimed') {
    if (!holding.signature) {
      return {
        success: false,
        error: 'Holding is already claimed but no signature was recorded',
        status: 500,
      }
    }
    return { success: true, signature: holding.signature }
  }

  if (!holding.wallet_address) {
    return {
      success: false,
      error:
        'You are still owed these tokens. Sign in with an embedded wallet to get an address for the claim.',
      status: 400,
    }
  }

  if (
    holding.status !== 'claimable' &&
    holding.status !== 'claiming' &&
    holding.status !== 'failed'
  ) {
    return {
      success: false,
      error: `Holding has unexpected status: ${holding.status}`,
      status: 409,
    }
  }

  const { data: rawGraduation, error: gradError } = await supabase
    .from('graduations')
    .select('mint_address, escrow_address, status')
    .eq('id', holding.graduation_id)
    .single()

  if (gradError || !rawGraduation) {
    return {
      success: false,
      error: gradError?.message ?? 'Graduation not found',
      status: 404,
    }
  }

  const graduation = rawGraduation as GraduationClaimRow

  if (!CLAIMABLE_GRADUATION_STATUSES.includes(graduation.status)) {
    return {
      success: false,
      error: 'Graduation is not ready for claims',
      status: 409,
    }
  }

  if (!graduation.mint_address || !graduation.escrow_address) {
    return {
      success: false,
      error: 'Graduation is missing mint or escrow address',
      status: 500,
    }
  }

  let expectedAmount: bigint
  try {
    expectedAmount = TokenAmount.fromDatabase(
      holding.tokens_onchain,
      TOKEN_DECIMALS
    ).toBaseUnit()
  } catch (err: any) {
    return {
      success: false,
      error: `Invalid tokens_onchain amount: ${err.message}`,
      status: 500,
    }
  }

  const mintPubkey = new PublicKey(graduation.mint_address)
  const escrowAddress = new PublicKey(graduation.escrow_address)
  const recipientPubkey = new PublicKey(holding.wallet_address)
  const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey)

  if (holding.status === 'claiming' || holding.status === 'failed') {
    let balance: bigint
    try {
      const { value } = await connection.getTokenAccountBalance(
        recipientAta,
        'finalized'
      )
      balance = BigInt(value.amount)
    } catch (err: any) {
      await supabase
        .from('graduation_holders')
        .update({
          status: 'failed',
          error: `Could not determine on-chain status: ${err.message}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', holdingId)
      return {
        success: false,
        error: `Could not determine on-chain status: ${err.message}`,
        status: 504,
      }
    }

    if (balance === expectedAmount) {
      const signature = holding.signature ?? 'unknown'
      await supabase
        .from('graduation_holders')
        .update({
          status: 'claimed',
          signature,
          error: null,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', holdingId)
      return { success: true, signature }
    }

    if (holding.status === 'claiming') {
      await supabase
        .from('graduation_holders')
        .update({
          status: 'failed',
          error: `Recipient token account has ${balance}, expected ${expectedAmount}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', holdingId)
    }

    return {
      success: false,
      error: `Claim did not land. Recipient token account has ${balance}, expected ${expectedAmount}. The claim is now failed and must be reviewed before retrying.`,
      status: 409,
    }
  }

  const latest = await connection.getLatestBlockhash('finalized')
  const tx = new Transaction({
    feePayer: platformPubkey,
    recentBlockhash: latest.blockhash,
  })

  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      platformPubkey,
      recipientAta,
      recipientPubkey,
      mintPubkey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createTransferInstruction(
      escrowAddress,
      recipientAta,
      platformPubkey,
      expectedAmount,
      [],
      TOKEN_PROGRAM_ID
    )
  )

  tx.partialSign(platformKeypair)
  const firstSignature = tx.signatures[0].signature
  if (!firstSignature) {
    return {
      success: false,
      error: 'Could not sign the claim transaction',
      status: 500,
    }
  }
  const signature = bs58.encode(firstSignature)

  await supabase
    .from('graduation_holders')
    .update({
      status: 'claiming',
      signature: null,
      error: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdingId)

  try {
    await connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: 'finalized',
      maxRetries: 3,
    })
  } catch (err: any) {
    await supabase
      .from('graduation_holders')
      .update({
        status: 'failed',
        signature: null,
        error: `Send rejected: ${err.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', holdingId)
    return {
      success: false,
      error: `Send rejected: ${err.message}`,
      status: 500,
    }
  }

  await supabase
    .from('graduation_holders')
    .update({
      status: 'claiming',
      signature,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdingId)

  try {
    await connection.confirmTransaction(signature, 'finalized')
  } catch (err: any) {
    await supabase
      .from('graduation_holders')
      .update({
        status: 'claiming',
        signature,
        error: `Confirmation failed: ${err.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', holdingId)
    return {
      success: false,
      error: `Confirmation failed: ${err.message}. The transaction may still land; a retry will check the chain before sending again.`,
      status: 504,
    }
  }

  await supabase
    .from('graduation_holders')
    .update({
      status: 'claimed',
      signature,
      error: null,
      claimed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdingId)

  return { success: true, signature }
}
