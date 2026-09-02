import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  AuthorityType,
  createSetAuthorityInstruction,
  getMint,
  getAccount,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { transition, type SupabaseType } from '@/lib/graduation/state'
import { TokenAmount } from '@/lib/token-amount'
import { Decimal } from '@/lib/decimal'

const USDC_DECIMALS = 6
const SNTL_DECIMALS = 6
const EXPECTED_SUPPLY = BigInt(100_000_000) * BigInt(10 ** SNTL_DECIMALS)

export interface RevokeDeps {
  supabase?: SupabaseType
  connection?: Connection
  platformKeypair?: Keypair
}

export interface RevokeResult {
  txId?: string
  already?: boolean
  supply: string
  mintAuthority: string | null
  freezeAuthority: string | null
  escrowBalance: string
}

export interface CompleteResult {
  txId?: string
  ledgerLiabilityBefore: string
  ledgerLiabilityAfter: string
  authorityRevokeSignature: string
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

async function loadGraduationForRevoke(supabase: SupabaseType, graduationId: string) {
  const { data: grad, error } = await supabase
    .from('graduations')
    .select('id, status, mint_address, escrow_address, authority_revoke_signature')
    .eq('id', graduationId)
    .single()

  if (error || !grad) {
    throw new Error(`Could not load graduation: ${error?.message ?? 'not found'}`)
  }

  return grad
}

async function loadGraduationForComplete(supabase: SupabaseType, graduationId: string) {
  const { data: grad, error } = await supabase
    .from('graduations')
    .select('id, status, authority_revoke_signature')
    .eq('id', graduationId)
    .single()

  if (error || !grad) {
    throw new Error(`Could not load graduation: ${error?.message ?? 'not found'}`)
  }

  return grad
}

async function getConfirmedRevokeSignature(
  connection: Connection,
  mint: PublicKey
): Promise<string | undefined> {
  const sigs = await connection.getSignaturesForAddress(mint, { limit: 20 }, 'finalized')
  const confirmed = sigs.filter((s) => s.err === null || s.err === undefined)
  return confirmed[0]?.signature
}

export async function revokeMintAuthority(
  graduationId: string,
  deps: RevokeDeps = {}
): Promise<RevokeResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()

  const grad = await loadGraduationForRevoke(supabase, graduationId)

  if (!grad.mint_address) {
    throw new Error('Graduation is missing mint_address')
  }

  const sntMint = new PublicKey(grad.mint_address)
  const mintInfo = await getMint(connection, sntMint, 'finalized')
  const supply = BigInt(mintInfo.supply)

  const mintAuthority = mintInfo.mintAuthority
  const freezeAuthority = mintInfo.freezeAuthority

  let escrowBalance = BigInt(0)
  if (grad.escrow_address) {
    try {
      const escrow = await getAccount(connection, new PublicKey(grad.escrow_address), 'finalized')
      escrowBalance = BigInt(escrow.amount)
    } catch {
      // Escrow account does not exist yet or is closed; treat as zero
    }
  }

  if (mintAuthority === null) {
    const txId =
      grad.authority_revoke_signature ?? await getConfirmedRevokeSignature(connection, sntMint)
    if (!txId) {
      throw new Error('Mint authority is already null, but no revoke signature could be found')
    }

    if (grad.status === 'founder_paid') {
      await transition(
        supabase,
        graduationId,
        'founder_paid',
        'revoking',
        {},
        'Mint authority already revoked on chain, recording transition',
        'platform'
      )
    }

    return {
      already: true,
      txId,
      supply: supply.toString(),
      mintAuthority: null,
      freezeAuthority: freezeAuthority?.toBase58() ?? null,
      escrowBalance: escrowBalance.toString(),
    }
  }

  if (grad.status !== 'founder_paid' && grad.status !== 'revoking') {
    throw new Error(`Cannot revoke mint authority from status ${grad.status}`)
  }

  if (supply !== EXPECTED_SUPPLY) {
    throw new Error(`SNTL supply is ${supply}, expected ${EXPECTED_SUPPLY}`)
  }

  if (escrowBalance !== BigInt(0)) {
    throw new Error(`Escrow balance is ${escrowBalance}, expected 0`)
  }

  if (grad.status === 'founder_paid') {
    await transition(supabase, graduationId, 'founder_paid', 'revoking', {}, 'Revoking mint authority', 'platform')
  }

  const tx = new Transaction()
  tx.add(
    createSetAuthorityInstruction(
      sntMint,
      platformKeypair.publicKey,
      AuthorityType.MintTokens,
      null
    )
  )

  const { blockhash } = await connection.getLatestBlockhash('finalized')
  tx.recentBlockhash = blockhash
  tx.feePayer = platformKeypair.publicKey

  const txId = await sendAndConfirmTransaction(connection, tx, [platformKeypair], {
    commitment: 'finalized',
  })

  return {
    txId,
    supply: supply.toString(),
    mintAuthority: mintAuthority.toBase58(),
    freezeAuthority: freezeAuthority?.toBase58() ?? null,
    escrowBalance: escrowBalance.toString(),
  }
}

async function loadLedgerLiability(supabase: SupabaseType): Promise<bigint> {
  const { data, error } = await supabase
    .from('ledger_liability')
    .select('backed_liability_exact')
    .single()

  if (error || !data) {
    throw new Error(`Could not load ledger liability: ${error?.message ?? 'not found'}`)
  }

  const fixed = Decimal.parse(data.backed_liability_exact).toFixed(USDC_DECIMALS)
  return TokenAmount.fromDatabase(fixed, USDC_DECIMALS).toBaseUnit()
}

export async function completeGraduation(
  graduationId: string,
  authorityRevokeSignature: string,
  deps: RevokeDeps = {}
): Promise<CompleteResult> {
  const supabase = deps.supabase ?? supabaseAdmin

  const grad = await loadGraduationForComplete(supabase, graduationId)

  const ledgerLiabilityBefore = await loadLedgerLiability(supabase)

  const txId = authorityRevokeSignature || grad.authority_revoke_signature
  if (!txId) {
    throw new Error('Cannot complete graduation without an authority_revoke_signature')
  }

  if (grad.status === 'complete') {
    const ledgerLiabilityAfter = await loadLedgerLiability(supabase)
    return {
      txId: grad.authority_revoke_signature ?? txId,
      ledgerLiabilityBefore: ledgerLiabilityBefore.toString(),
      ledgerLiabilityAfter: ledgerLiabilityAfter.toString(),
      authorityRevokeSignature: txId,
    }
  }

  if (grad.status !== 'revoking') {
    throw new Error(`Cannot complete graduation from status ${grad.status}`)
  }

  await transition(
    supabase,
    graduationId,
    'revoking',
    'complete',
    { authority_revoke_signature: txId },
    'Mint authority revoked, graduation complete',
    'platform'
  )

  const ledgerLiabilityAfter = await loadLedgerLiability(supabase)

  return {
    txId,
    ledgerLiabilityBefore: ledgerLiabilityBefore.toString(),
    ledgerLiabilityAfter: ledgerLiabilityAfter.toString(),
    authorityRevokeSignature: txId,
  }
}
