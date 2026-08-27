import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { supabaseAdmin } from './supabaseServer'
import { privyClient } from './privy-server'

const USDC_DECIMALS = 6
const MIN_SWEEP_USDC = 1
const SIGNATURE_LIMIT = 20
const USER_SCAN_DELAY_MS = 200

export interface ScanResult {
  users: number
  detected: number
  swept: number
  awaiting: number
  skipped: number
  errors: number
}

function requireEnv(): {
  rpcUrl: string
  usdcMint: string
  platformAddress: string
  platformPrivateKey: string
} {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
  const platformPrivateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY

  if (!rpcUrl || !usdcMint || !platformAddress || !platformPrivateKey) {
    throw new Error(
      'Missing required environment variables: SOLANA_RPC_URL, USDC_MINT_ADDRESS, PLATFORM_SOLANA_ADDRESS, PLATFORM_WALLET_PRIVATE_KEY'
    )
  }

  return { rpcUrl, usdcMint, platformAddress, platformPrivateKey }
}

async function sweepDeposit(
  deposit: any,
  user: { id: string; privy_id: string; custodial_wallet_address: string },
  walletId: string,
  usdcMintPubkey: PublicKey,
  platformPubkey: PublicKey,
  platformKeypair: Keypair,
  connection: Connection
): Promise<string> {
  const custodialPubkey = new PublicKey(user.custodial_wallet_address)
  const sourceAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
  const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)

  const amountUsdc = Number(deposit.amount_usdc)
  const amountRaw = BigInt(Math.floor(amountUsdc * 10 ** USDC_DECIMALS))

  const transaction = new Transaction()
  transaction.add(createTransferInstruction(sourceAta, treasuryAta, custodialPubkey, amountRaw))

  const { blockhash } = await connection.getLatestBlockhash('finalized')
  transaction.recentBlockhash = blockhash
  transaction.feePayer = platformPubkey
  transaction.partialSign(platformKeypair)

  const signResult = await privyClient.walletApi.solana.signTransaction({
    walletId,
    transaction,
  })

  const serialized = signResult.signedTransaction.serialize()
  const sweepSignature = await connection.sendRawTransaction(serialized)
  await connection.confirmTransaction(sweepSignature, 'finalized')

  return sweepSignature
}

async function scanOneUser(
  user: { id: string; privy_id: string; custodial_wallet_address: string },
  connection: Connection,
  usdcMintPubkey: PublicKey,
  platformPubkey: PublicKey,
  platformKeypair: Keypair
): Promise<Pick<ScanResult, 'detected' | 'swept' | 'awaiting' | 'skipped' | 'errors'>> {
  const result = { detected: 0, swept: 0, awaiting: 0, skipped: 0, errors: 0 }

  const custodialPubkey = new PublicKey(user.custodial_wallet_address)
  const userAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)

  const signatures = await connection.getSignaturesForAddress(userAta, {
    limit: SIGNATURE_LIMIT,
  })
  const sigStrings = signatures.filter((s) => !s.err).map((s) => s.signature)

  if (sigStrings.length > 0) {
    const { data: existingRows } = await supabaseAdmin
      .from('deposits')
      .select('signature')
      .in('signature', sigStrings)

    const existing = new Set((existingRows || []).map((r: any) => r.signature))

    for (const signature of sigStrings) {
      if (existing.has(signature)) continue

      const parsedTx = await connection.getParsedTransaction(signature, {
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      })

      if (!parsedTx) continue

      let amount = 0
      let sourceAta: string | null = null

      for (const ix of parsedTx.transaction.message.instructions) {
        const parsed = (ix as any).parsed
        if (!parsed) continue
        if (!(ix as any).programId.equals(TOKEN_PROGRAM_ID)) continue
        if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') continue

        const info = parsed.info
        if (!info) continue

        if (info.destination !== userAta.toBase58()) continue

        if (parsed.type === 'transferChecked') {
          if (info.mint !== usdcMintPubkey.toBase58()) continue
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

      if (amount <= 0 || !sourceAta) continue

      const { error: recordError } = await supabaseAdmin.rpc('record_deposit_detected', {
        p_user_id: user.id,
        p_signature: signature,
        p_amount_usdc: amount,
        p_source_ata: sourceAta,
      })

      if (recordError) {
        const isUniqueViolation =
          recordError.code === '23505' ||
          (typeof recordError.message === 'string' && recordError.message.includes('deposits_signature_key'))

        if (isUniqueViolation) {
          console.log('[scan-user-deposits] already recorded by another process:', signature)
        } else {
          console.error('[scan-user-deposits] record_deposit_detected failed:', recordError)
          result.errors++
        }
      } else {
        result.detected++
      }
    }
  }

  const { data: detectedDeposits, error: detectedError } = await supabaseAdmin
    .from('deposits')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'detected')

  if (detectedError) {
    throw new Error(`Failed to fetch detected deposits: ${detectedError.message}`)
  }

  if (!detectedDeposits || detectedDeposits.length === 0) {
    return result
  }

  let walletId: string | null = null
  try {
    const privyUser = await privyClient.getUserById(user.privy_id)
    const walletAccount = (privyUser.linkedAccounts as any[]).find(
      (a: any) => a.type === 'wallet' && a.address === user.custodial_wallet_address
    ) as any

    if (walletAccount && walletAccount.delegated === true && typeof walletAccount.id === 'string') {
      walletId = walletAccount.id
    }
  } catch (err) {
    console.error('[scan-user-deposits] getUserById failed:', err)
  }

  for (const deposit of detectedDeposits) {
    if (Number(deposit.amount_usdc) < MIN_SWEEP_USDC) {
      console.log(`[scan-user-deposits] deposit ${deposit.id} below ${MIN_SWEEP_USDC} USDC, leaving detected`)
      result.skipped++
      continue
    }

    if (!walletId) {
      try {
        const { error } = await supabaseAdmin.rpc('mark_deposit_awaiting_consent', { p_deposit_id: deposit.id })
        if (error) throw error
        result.awaiting++
      } catch (err) {
        console.error(`[scan-user-deposits] mark_deposit_awaiting_consent failed for ${deposit.id}:`, err)
        result.errors++
      }
      continue
    }

    try {
      const { error: markSweepingError } = await supabaseAdmin.rpc('mark_deposit_sweeping', {
        p_deposit_id: deposit.id,
      })
      if (markSweepingError) throw markSweepingError
    } catch (err) {
      console.error(`[scan-user-deposits] mark_deposit_sweeping failed for ${deposit.id}:`, err)
      result.errors++
      continue
    }

    try {
      const sweepSignature = await sweepDeposit(
        deposit,
        user,
        walletId,
        usdcMintPubkey,
        platformPubkey,
        platformKeypair,
        connection
      )

      const { error: markSweptError } = await supabaseAdmin.rpc('mark_deposit_swept', {
        p_deposit_id: deposit.id,
        p_sweep_signature: sweepSignature,
      })
      if (markSweptError) throw markSweptError

      const { error: creditError } = await supabaseAdmin.rpc('credit_swept_deposit', { p_deposit_id: deposit.id })
      if (creditError) throw creditError

      result.swept++
    } catch (err) {
      console.error(`[scan-user-deposits] sweep failed for ${deposit.id}:`, err)
      result.errors++
    }
  }

  return result
}

export async function scanAndSweepUserDeposits(
  userId: string | null,
  connection?: Connection
): Promise<ScanResult> {
  const env = requireEnv()

  const conn = connection ?? new Connection(env.rpcUrl, 'finalized')
  const usdcMintPubkey = new PublicKey(env.usdcMint)
  const platformPubkey = new PublicKey(env.platformAddress)
  const platformKeypair = Keypair.fromSecretKey(bs58.decode(env.platformPrivateKey))

  let query = supabaseAdmin
    .from('users')
    .select('id, privy_id, custodial_wallet_address')
    .not('custodial_wallet_address', 'is', null)

  if (userId) {
    query = query.eq('id', userId)
  }

  const { data: users, error } = await query
  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }
  if (!users || users.length === 0) {
    return { users: 0, detected: 0, swept: 0, awaiting: 0, skipped: 0, errors: 0 }
  }

  const totals: ScanResult = { users: 0, detected: 0, swept: 0, awaiting: 0, skipped: 0, errors: 0 }

  for (const user of users) {
    try {
      const result = await scanOneUser(user as any, conn, usdcMintPubkey, platformPubkey, platformKeypair)
      totals.users++
      totals.detected += result.detected
      totals.swept += result.swept
      totals.awaiting += result.awaiting
      totals.skipped += result.skipped
      totals.errors += result.errors
    } catch (err) {
      console.error(`[scan-user-deposits] user ${user.id} scan failed:`, err)
      totals.users++
      totals.errors++
    }

    await new Promise((resolve) => setTimeout(resolve, USER_SCAN_DELAY_MS))
  }

  console.log(
    `[scan-user-deposits] complete: ${JSON.stringify(totals)}`
  )
  return totals
}
