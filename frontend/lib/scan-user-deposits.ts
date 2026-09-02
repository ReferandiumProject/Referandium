import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import bs58 from 'bs58'
import { supabaseAdmin } from './supabaseServer'
import { privyClient } from './privy-server'
import { recordSystemError } from './system-errors'

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
  connection: Connection,
  userAtaBalanceUsdc: number
): Promise<string> {
  const custodialPubkey = new PublicKey(user.custodial_wallet_address)
  const sourceAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
  const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)

  const depositAmountUsdc = Number(deposit.amount_usdc)
  const sweepAmountUsdc = Math.min(depositAmountUsdc, Math.max(0, userAtaBalanceUsdc))

  if (sweepAmountUsdc <= 0) {
    throw new Error(`Insufficient token balance for deposit ${deposit.id}: ${userAtaBalanceUsdc} USDC available`)
  }

  const amountRaw = BigInt(Math.floor(sweepAmountUsdc * 10 ** USDC_DECIMALS))
  if (amountRaw === BigInt(0)) {
    throw new Error(`Sweep amount rounded to zero for deposit ${deposit.id}`)
  }

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

  // Persist the actual amount and signature before we wait for confirmation.
  // If confirmation fails, the row is still retryable with a known signature.
  const { error: updateError } = await supabaseAdmin
    .from('deposits')
    .update({
      amount_usdc: sweepAmountUsdc,
      sweep_signature: sweepSignature,
    })
    .eq('id', deposit.id)

  if (updateError) {
    throw new Error(`Failed to update deposit before confirmation: ${updateError.message}`)
  }

  await connection.confirmTransaction(sweepSignature, 'finalized')

  return sweepSignature
}

async function scanOneUser(
  user: {
    id: string
    privy_id: string
    custodial_wallet_address: string
    deposits_scanned_from: string | null
  },
  connection: Connection,
  usdcMintPubkey: PublicKey,
  platformPubkey: PublicKey,
  platformKeypair: Keypair
): Promise<Pick<ScanResult, 'detected' | 'swept' | 'awaiting' | 'skipped' | 'errors'>> {
  const result = { detected: 0, swept: 0, awaiting: 0, skipped: 0, errors: 0 }

  const custodialPubkey = new PublicKey(user.custodial_wallet_address)
  const userAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
  const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)

  const signatures = await connection.getSignaturesForAddress(userAta, {
    limit: SIGNATURE_LIMIT,
  })
  const sigStrings = signatures.filter((s) => !s.err).map((s) => s.signature)

  const scannedFromTimestamp = user.deposits_scanned_from
    ? Math.floor(new Date(user.deposits_scanned_from).getTime() / 1000)
    : 0

  if (sigStrings.length > 0) {
    const { data: existingRows } = await supabaseAdmin
      .from('deposits')
      .select('signature')
      .in('signature', sigStrings)

    const existing = new Set((existingRows || []).map((r: any) => r.signature))

    for (const sig of signatures) {
      if (sig.err || existing.has(sig.signature)) continue

      if (sig.blockTime == null) {
        console.warn('[scan-user-deposits] skipping signature without blockTime:', sig.signature)
        continue
      }

      const parsedTx = await connection.getParsedTransaction(sig.signature, {
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

      if (sourceAta === treasuryAta.toBase58()) {
        console.log('[scan-user-deposits] skipping platform treasury source:', sig.signature)
        continue
      }

      const isPreCutoff = sig.blockTime < scannedFromTimestamp

      const { data: recordData, error: recordError } = await supabaseAdmin.rpc('record_deposit_detected', {
        p_user_id: user.id,
        p_signature: sig.signature,
        p_amount_usdc: amount,
        p_source_ata: sourceAta,
      })

      if (recordError) {
        const isUniqueViolation =
          recordError.code === '23505' ||
          (typeof recordError.message === 'string' && recordError.message.includes('deposits_signature_key'))

        if (isUniqueViolation) {
          console.log('[scan-user-deposits] already recorded by another process:', sig.signature)
        } else {
          console.error('[scan-user-deposits] record_deposit_detected failed:', recordError)
          void recordSystemError({
            source: 'swallowed',
            name: 'ScanRecordDepositDetectedFailed',
            message: recordError.message,
            path: 'lib/scan-user-deposits.ts/scanOneUser',
            userId: user.id,
            context: { signature: sig.signature, recordError: { message: recordError.message, code: recordError.code } },
          })
          result.errors++
        }
      } else if (isPreCutoff) {
        const { error: preCutoffError } = await supabaseAdmin.rpc('mark_deposit_pre_cutoff', {
          p_deposit_id: recordData.id,
        })

        if (preCutoffError) {
          console.error('[scan-user-deposits] mark_deposit_pre_cutoff failed:', preCutoffError)
          void recordSystemError({
            source: 'swallowed',
            name: 'ScanMarkDepositPreCutoffFailed',
            message: preCutoffError.message,
            path: 'lib/scan-user-deposits.ts/scanOneUser',
            userId: user.id,
            context: { depositId: recordData.id, preCutoffError: { message: preCutoffError.message, code: preCutoffError.code } },
          })
          result.errors++
        }
      } else {
        result.detected++
      }
    }
  }

  const { data: depositsToSweep, error: depositsError } = await supabaseAdmin
    .from('deposits')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['detected', 'sweeping'])

  if (depositsError) {
    throw new Error(`Failed to fetch deposits to sweep: ${depositsError.message}`)
  }

  if (!depositsToSweep || depositsToSweep.length === 0) {
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
  } catch (err: any) {
    console.error('[scan-user-deposits] getUserById failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'ScanGetUserByIdFailed',
      message: err?.message ?? 'getUserById failed',
      path: 'lib/scan-user-deposits.ts/scanOneUser',
      userId: user.id,
      context: { custodialWallet: user.custodial_wallet_address, stack: err?.stack },
    })
  }

  let userAtaBalanceUsdc = 0
  try {
    const { value } = await connection.getTokenAccountBalance(userAta)
    userAtaBalanceUsdc = Number(value.amount) / 10 ** (value.decimals ?? USDC_DECIMALS)
  } catch (err: any) {
    console.error('[scan-user-deposits] getTokenAccountBalance failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'ScanGetTokenAccountBalanceFailed',
      message: err?.message ?? 'getTokenAccountBalance failed',
      path: 'lib/scan-user-deposits.ts/scanOneUser',
      userId: user.id,
      context: { userAta: userAta.toBase58(), stack: err?.stack },
    })
  }

  for (const deposit of depositsToSweep) {
    if (deposit.status === 'detected') {
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
        } catch (err: any) {
          console.error(`[scan-user-deposits] mark_deposit_awaiting_consent failed for ${deposit.id}:`, err)
          void recordSystemError({
            source: 'swallowed',
            name: 'ScanMarkDepositAwaitingConsentFailed',
            message: err?.message ?? 'mark_deposit_awaiting_consent failed',
            path: 'lib/scan-user-deposits.ts/scanOneUser',
            userId: user.id,
            context: { depositId: deposit.id, stack: err?.stack },
          })
          result.errors++
        }
        continue
      }

      try {
        const { error: markSweepingError } = await supabaseAdmin.rpc('mark_deposit_sweeping', {
          p_deposit_id: deposit.id,
        })
        if (markSweepingError) throw markSweepingError

        const sweepSignature = await sweepDeposit(
          deposit,
          user,
          walletId,
          usdcMintPubkey,
          platformPubkey,
          platformKeypair,
          connection,
          userAtaBalanceUsdc
        )

        const { error: markSweptError } = await supabaseAdmin.rpc('mark_deposit_swept', {
          p_deposit_id: deposit.id,
          p_sweep_signature: sweepSignature,
        })
        if (markSweptError) throw markSweptError

        const { error: creditError } = await supabaseAdmin.rpc('credit_swept_deposit', { p_deposit_id: deposit.id })
        if (creditError) throw creditError

        result.swept++
      } catch (err: any) {
        console.error(`[scan-user-deposits] sweep failed for ${deposit.id}:`, err)
        void recordSystemError({
          source: 'swallowed',
          name: 'ScanSweepFailed',
          message: err?.message ?? 'sweep failed',
          path: 'lib/scan-user-deposits.ts/scanOneUser',
          userId: user.id,
          context: { depositId: deposit.id, stack: err?.stack },
        })
        result.errors++
      }
    } else if (deposit.status === 'sweeping') {
      const depositAmountUsdc = Number(deposit.amount_usdc)

      if (deposit.sweep_signature) {
        // If the funds are no longer in the wallet, the sweep already landed.
        if (userAtaBalanceUsdc < depositAmountUsdc) {
          try {
            const { error: markSweptError } = await supabaseAdmin.rpc('mark_deposit_swept', {
              p_deposit_id: deposit.id,
              p_sweep_signature: deposit.sweep_signature,
            })
            if (markSweptError) throw markSweptError

            const { error: creditError } = await supabaseAdmin.rpc('credit_swept_deposit', { p_deposit_id: deposit.id })
            if (creditError) throw creditError

            result.swept++
          } catch (err: any) {
            console.error(`[scan-user-deposits] finalizing stuck sweep for ${deposit.id}:`, err)
            void recordSystemError({
              source: 'swallowed',
              name: 'ScanFinalizeStuckSweepFailed',
              message: err?.message ?? 'finalizing stuck sweep failed',
              path: 'lib/scan-user-deposits.ts/scanOneUser',
              userId: user.id,
              context: { depositId: deposit.id, stack: err?.stack },
            })
            result.errors++
          }
          continue
        }

        // Funds are still present; confirm the old signature did not land before retrying.
        try {
          const sigStatus = await connection.getSignatureStatus(deposit.sweep_signature)
          if (sigStatus?.value?.confirmationStatus === 'finalized') {
            const { error: markSweptError } = await supabaseAdmin.rpc('mark_deposit_swept', {
              p_deposit_id: deposit.id,
              p_sweep_signature: deposit.sweep_signature,
            })
            if (markSweptError) throw markSweptError

            const { error: creditError } = await supabaseAdmin.rpc('credit_swept_deposit', { p_deposit_id: deposit.id })
            if (creditError) throw creditError

            result.swept++
            continue
          }
        } catch (err: any) {
          console.log(`[scan-user-deposits] could not verify signature status for ${deposit.id}:`, err)
          void recordSystemError({
            source: 'swallowed',
            name: 'ScanSignatureStatusCheckFailed',
            message: err?.message ?? 'could not verify signature status',
            path: 'lib/scan-user-deposits.ts/scanOneUser',
            userId: user.id,
            context: { depositId: deposit.id, sweepSignature: deposit.sweep_signature, stack: err?.stack },
          })
        }
      }

      const sweepAmountUsdc = Math.min(depositAmountUsdc, userAtaBalanceUsdc)
      if (sweepAmountUsdc <= 0) {
        console.log(`[scan-user-deposits] no funds to retry sweep for ${deposit.id}`)
        continue
      }

      if (!walletId) {
        console.error(`[scan-user-deposits] no wallet for retry of ${deposit.id}`)
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
          connection,
          userAtaBalanceUsdc
        )

        const { error: markSweptError } = await supabaseAdmin.rpc('mark_deposit_swept', {
          p_deposit_id: deposit.id,
          p_sweep_signature: sweepSignature,
        })
        if (markSweptError) throw markSweptError

        const { error: creditError } = await supabaseAdmin.rpc('credit_swept_deposit', { p_deposit_id: deposit.id })
        if (creditError) throw creditError

        result.swept++
      } catch (err: any) {
        console.error(`[scan-user-deposits] retry sweep failed for ${deposit.id}:`, err)
        void recordSystemError({
          source: 'swallowed',
          name: 'ScanRetrySweepFailed',
          message: err?.message ?? 'retry sweep failed',
          path: 'lib/scan-user-deposits.ts/scanOneUser',
          userId: user.id,
          context: { depositId: deposit.id, stack: err?.stack },
        })
        result.errors++
      }
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
    .select('id, privy_id, custodial_wallet_address, deposits_scanned_from')
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
    } catch (err: any) {
      console.error(`[scan-user-deposits] user ${user.id} scan failed:`, err)
      void recordSystemError({
        source: 'swallowed',
        name: 'ScanUserDepositsFailed',
        message: err?.message ?? 'user scan failed',
        path: 'lib/scan-user-deposits.ts/scanAndSweepUserDeposits',
        userId: user.id,
        context: { stack: err?.stack },
      })
      totals.users++
      totals.errors++
    }

    await new Promise((resolve) => setTimeout(resolve, USER_SCAN_DELAY_MS))
  }

  console.log(`[scan-user-deposits] complete: ${JSON.stringify(totals)}`)
  return totals
}
