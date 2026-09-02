import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { transition, type SupabaseType } from '@/lib/graduation/state'
import { TokenAmount } from '@/lib/token-amount'
import { notifyStartupGraduated } from '@/lib/notifications'

const USDC_DECIMALS = 6

export interface PayFounderDeps {
  supabase?: SupabaseType
  connection?: Connection
  platformKeypair?: Keypair
  founderWallet?: PublicKey | string
}

export interface PayFounderResult {
  success: boolean
  already?: boolean
  txId?: string
  founderBalanceBefore: bigint
  founderBalanceAfter: bigint
  treasuryBalanceBefore: bigint
  treasuryBalanceAfter: bigint
  amount: bigint
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
    .select('id, status, founder_usdc, founder_payout_signature, founder_wallet_address, mint_address')
    .eq('id', graduationId)
    .single()

  if (error || !grad) {
    throw new Error(`Could not load graduation: ${error?.message ?? 'not found'}`)
  }

  return grad
}

async function getConfirmedPayoutSignature(connection: Connection, tokenAccount: PublicKey): Promise<string | undefined> {
  const sigs = await connection.getSignaturesForAddress(tokenAccount, { limit: 20 }, 'finalized')
  const confirmed = sigs.filter((s) => s.err === null || s.err === undefined)
  return confirmed[0]?.signature
}

export async function payFounder(
  graduationId: string,
  deps: PayFounderDeps = {}
): Promise<PayFounderResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()

  const grad = await loadGraduation(supabase, graduationId)

  if (!grad.founder_usdc) {
    throw new Error('Graduation is missing founder_usdc')
  }

  const amount = TokenAmount.fromDatabase(grad.founder_usdc, USDC_DECIMALS).toBaseUnit()

  const founderWalletInput =
    deps.founderWallet ?? grad.founder_wallet_address ?? undefined
  if (!founderWalletInput) {
    throw new Error('Founder wallet address is not set')
  }
  const founderWallet =
    typeof founderWalletInput === 'string'
      ? new PublicKey(founderWalletInput)
      : founderWalletInput

  const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS!)
  const treasuryUsdcAta = getAssociatedTokenAddressSync(usdcMint, platformKeypair.publicKey)
  const founderUsdcAta = getAssociatedTokenAddressSync(usdcMint, founderWallet)

  const [treasuryNowAcc, founderNowAcc] = await Promise.allSettled([
    getAccount(connection, treasuryUsdcAta, 'finalized'),
    getAccount(connection, founderUsdcAta, 'finalized'),
  ])

  const treasuryBalanceNow =
    treasuryNowAcc.status === 'fulfilled'
      ? BigInt(treasuryNowAcc.value.amount)
      : BigInt(0)

  const founderBalanceNow =
    founderNowAcc.status === 'fulfilled'
      ? BigInt(founderNowAcc.value.amount)
      : BigInt(0)

  if (grad.status === 'founder_paid' || founderBalanceNow === amount) {
    const already = grad.status === 'founder_paid' || founderBalanceNow === amount
    const txId = grad.founder_payout_signature ?? await getConfirmedPayoutSignature(connection, founderUsdcAta)
    if (!txId) {
      throw new Error('Founder payout is already on chain, but no signature could be found')
    }

    if (grad.status !== 'founder_paid') {
      if (grad.status === 'burned') {
        await transition(supabase, graduationId, 'burned', 'paying_founder', {}, 'Founder payout already on chain, recording transition', 'platform')
      }
      await transition(
        supabase,
        graduationId,
        'paying_founder',
        'founder_paid',
        { founder_payout_signature: txId },
        'Founder payout signature recorded',
        'platform'
      )

      const payoutUsdc = Number(amount) / 10 ** USDC_DECIMALS
      void notifyStartupGraduated(graduationId, payoutUsdc)
    }

    return {
      success: true,
      already,
      txId,
      founderBalanceBefore: founderBalanceNow - amount,
      founderBalanceAfter: founderBalanceNow,
      treasuryBalanceBefore: treasuryBalanceNow + amount,
      treasuryBalanceAfter: treasuryBalanceNow,
      amount,
    }
  }

  if (grad.status !== 'burned' && grad.status !== 'paying_founder') {
    throw new Error(`Cannot pay founder from status ${grad.status}`)
  }

  if (grad.status === 'burned') {
    await transition(supabase, graduationId, 'burned', 'paying_founder', {}, 'Paying founder', 'platform')
  }

  const tx = new Transaction()

  if (founderNowAcc.status === 'rejected') {
    tx.add(
      createAssociatedTokenAccountInstruction(
        platformKeypair.publicKey,
        founderUsdcAta,
        founderWallet,
        usdcMint
      )
    )
  }

  tx.add(
    createTransferCheckedInstruction(
      treasuryUsdcAta,
      usdcMint,
      founderUsdcAta,
      platformKeypair.publicKey,
      amount,
      USDC_DECIMALS
    )
  )

  const { blockhash } = await connection.getLatestBlockhash('finalized')
  tx.recentBlockhash = blockhash
  tx.feePayer = platformKeypair.publicKey

  const txId = await sendAndConfirmTransaction(connection, tx, [platformKeypair], {
    commitment: 'finalized',
  })

  await transition(
    supabase,
    graduationId,
    'paying_founder',
    'founder_paid',
    { founder_payout_signature: txId },
    'Founder paid',
    'platform'
  )

  const payoutUsdc = Number(amount) / 10 ** USDC_DECIMALS
  void notifyStartupGraduated(graduationId, payoutUsdc)

  const [treasuryAfterAcc, founderAfterAcc] = await Promise.all([
    getAccount(connection, treasuryUsdcAta, 'finalized'),
    getAccount(connection, founderUsdcAta, 'finalized'),
  ])

  return {
    success: true,
    txId,
    founderBalanceBefore: founderBalanceNow,
    founderBalanceAfter: BigInt(founderAfterAcc.amount),
    treasuryBalanceBefore: treasuryBalanceNow,
    treasuryBalanceAfter: BigInt(treasuryAfterAcc.amount),
    amount,
  }
}
