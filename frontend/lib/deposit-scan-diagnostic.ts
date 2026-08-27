import { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import { supabaseAdmin } from './supabaseServer'
import { privyClient } from './privy-server'

const USDC_DECIMALS = 6
const MIN_SWEEP_USDC = 1
const SIGNATURE_LIMIT = 20

export interface DepositScanCandidate {
  signature: string
  blockTime: number | null
  source: string | null
  destination: string | null
  amount: number
  mint: string | null
  reason: 'accepted' | 'before_cutoff' | 'treasury_source' | 'below_minimum' | 'already_recorded' | 'awaiting_consent' | 'no_inbound_usdc'
  existingStatus?: string | null
}

export async function diagnoseDepositScanForUser(
  userId: string,
  connection: Connection
): Promise<DepositScanCandidate[]> {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS

  if (!rpcUrl || !usdcMint || !platformAddress) {
    throw new Error('Missing SOLANA_RPC_URL, USDC_MINT_ADDRESS, or PLATFORM_SOLANA_ADDRESS')
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, privy_id, custodial_wallet_address, deposits_scanned_from')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  if (!user.custodial_wallet_address) {
    throw new Error('User has no custodial wallet address')
  }

  const usdcMintPubkey = new PublicKey(usdcMint)
  const platformPubkey = new PublicKey(platformAddress)
  const custodialPubkey = new PublicKey(user.custodial_wallet_address)

  const userAta = await getAssociatedTokenAddress(usdcMintPubkey, custodialPubkey)
  const treasuryAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)

  const signatures = await connection.getSignaturesForAddress(userAta, {
    limit: SIGNATURE_LIMIT,
  })

  const sigStrings = signatures.filter((s) => !s.err).map((s) => s.signature)

  const { data: existingRows } = await supabaseAdmin
    .from('deposits')
    .select('signature, status')
    .in('signature', sigStrings)

  const existing = new Map((existingRows || []).map((r: any) => [r.signature, r.status]))

  const scannedFromTimestamp = user.deposits_scanned_from
    ? Math.floor(new Date(user.deposits_scanned_from).getTime() / 1000)
    : 0

  let walletId: string | null = null
  if (user.privy_id) {
    try {
      const privyUser = await privyClient.getUserById(user.privy_id)
      const walletAccount = (privyUser.linkedAccounts as any[]).find(
        (a: any) => a.type === 'wallet' && a.address === user.custodial_wallet_address
      ) as any

      if (walletAccount && walletAccount.delegated === true && typeof walletAccount.id === 'string') {
        walletId = walletAccount.id
      }
    } catch {
      walletId = null
    }
  }

  const candidates: DepositScanCandidate[] = []

  for (const sig of signatures) {
    if (sig.err) continue

    const parsedTx = await connection.getParsedTransaction(sig.signature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    })

    if (!parsedTx) continue

    let amount = 0
    let sourceAta: string | null = null
    let destinationAta: string | null = null
    let mint: string | null = null

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
          if (destinationAta === null) destinationAta = info.destination
          if (mint === null) mint = info.mint
        }
      } else {
        const raw = info.amount
        if (raw) {
          amount += Number(raw) / 10 ** USDC_DECIMALS
          if (sourceAta === null) sourceAta = info.source
          if (destinationAta === null) destinationAta = info.destination
        }
      }
    }

    if (amount <= 0 || !sourceAta) {
      candidates.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        source: sourceAta,
        destination: destinationAta,
        amount,
        mint,
        reason: 'no_inbound_usdc',
      })
      continue
    }

    const existingStatus = existing.get(sig.signature)

    if (existingStatus !== undefined) {
      candidates.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        source: sourceAta,
        destination: destinationAta,
        amount,
        mint,
        reason: 'already_recorded',
        existingStatus,
      })
      continue
    }

    if (sourceAta === treasuryAta.toBase58()) {
      candidates.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        source: sourceAta,
        destination: destinationAta,
        amount,
        mint,
        reason: 'treasury_source',
      })
      continue
    }

    if (sig.blockTime != null && sig.blockTime < scannedFromTimestamp) {
      candidates.push({
        signature: sig.signature,
        blockTime: sig.blockTime,
        source: sourceAta,
        destination: destinationAta,
        amount,
        mint,
        reason: 'before_cutoff',
      })
      continue
    }

    if (amount < MIN_SWEEP_USDC) {
      candidates.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        source: sourceAta,
        destination: destinationAta,
        amount,
        mint,
        reason: 'below_minimum',
      })
      continue
    }

    if (!walletId) {
      candidates.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        source: sourceAta,
        destination: destinationAta,
        amount,
        mint,
        reason: 'awaiting_consent',
      })
      continue
    }

    candidates.push({
      signature: sig.signature,
      blockTime: sig.blockTime ?? null,
      source: sourceAta,
      destination: destinationAta,
      amount,
      mint,
      reason: 'accepted',
    })
  }

  return candidates
}
