import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  createBurnInstruction,
  getMint,
  getAccount,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { transition, type SupabaseType } from '@/lib/graduation/state'

export interface BurnDeps {
  supabase?: SupabaseType
  connection?: Connection
  platformKeypair?: Keypair
}

export interface BurnResult {
  success: boolean
  already?: boolean
  txId?: string
}

function assertEnv(): { connection: Connection; platformKeypair: Keypair } {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY

  if (!rpcUrl || !privateKeyBase58) {
    throw new Error('Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars')
  }

  return {
    connection: new Connection(rpcUrl, 'finalized'),
    platformKeypair: Keypair.fromSecretKey(bs58.decode(privateKeyBase58)),
  }
}

async function loadGraduation(supabase: SupabaseType, graduationId: string) {
  const { data: grad, error } = await supabase
    .from('graduations')
    .select('id, status, lp_mint_address, lp_token_account, lp_burn_signature, pool_address, mint_address')
    .eq('id', graduationId)
    .single()

  if (error || !grad) {
    throw new Error(`Could not load graduation: ${error?.message ?? 'not found'}`)
  }

  return grad
}

async function getConfirmedBurnSignature(connection: Connection, tokenAccount: PublicKey): Promise<string | undefined> {
  const sigs = await connection.getSignaturesForAddress(tokenAccount, { limit: 20 }, 'finalized')
  const confirmed = sigs.filter((s) => s.err === null || s.err === undefined)
  return confirmed[0]?.signature
}

export async function burnLpTokens(
  graduationId: string,
  deps: BurnDeps = {}
): Promise<BurnResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()

  const grad = await loadGraduation(supabase, graduationId)

  if (grad.status === 'burned') {
    return { success: true, already: true, txId: grad.lp_burn_signature ?? undefined }
  }

  if (!grad.lp_mint_address || !grad.lp_token_account) {
    throw new Error('Graduation is missing lp_mint_address or lp_token_account')
  }

  const lpMint = new PublicKey(grad.lp_mint_address)
  const lpTokenAccount = new PublicKey(grad.lp_token_account)

  const [lpMintInfo, lpAccount] = await Promise.all([
    getMint(connection, lpMint, 'finalized'),
    getAccount(connection, lpTokenAccount, 'finalized'),
  ])

  const lpTotalSupply = BigInt(lpMintInfo.supply)
  const ourBalance = BigInt(lpAccount.amount)

  if (lpTotalSupply === BigInt(0)) {
    const txId = grad.lp_burn_signature ?? await getConfirmedBurnSignature(connection, lpTokenAccount)
    if (!txId) {
      throw new Error('LP mint supply is already 0, but no burn signature could be found')
    }

    if (grad.status === 'pooled') {
      await transition(supabase, graduationId, 'pooled', 'burning', {}, 'LP already burned on chain, recording transition', 'platform')
    }
    await transition(
      supabase,
      graduationId,
      'burning',
      'burned',
      { lp_burn_signature: txId },
      'LP burn signature recorded',
      'platform'
    )

    return { success: true, already: true, txId }
  }

  if (ourBalance === BigInt(0)) {
    throw new Error('LP token account balance is 0, but LP mint supply is not — state is inconsistent')
  }

  const owner = lpAccount.owner
  if (owner.toBase58() !== platformKeypair.publicKey.toBase58()) {
    throw new Error(
      `LP token account owner ${owner.toBase58()} does not match platform wallet ${platformKeypair.publicKey.toBase58()}`
    )
  }

  if (grad.status !== 'pooled' && grad.status !== 'burning') {
    throw new Error(`Cannot burn from status ${grad.status}`)
  }

  if (grad.status === 'pooled') {
    await transition(supabase, graduationId, 'pooled', 'burning', {}, 'Burning LP tokens', 'platform')
  }

  const tx = new Transaction()
  tx.add(createBurnInstruction(lpTokenAccount, lpMint, owner, ourBalance))

  const { blockhash } = await connection.getLatestBlockhash('finalized')
  tx.recentBlockhash = blockhash
  tx.feePayer = platformKeypair.publicKey

  const txId = await sendAndConfirmTransaction(connection, tx, [platformKeypair], {
    commitment: 'finalized',
  })

  await transition(
    supabase,
    graduationId,
    'burning',
    'burned',
    { lp_burn_signature: txId },
    'LP tokens burned',
    'platform'
  )

  return { success: true, txId }
}
