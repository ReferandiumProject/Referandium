import { Connection } from '@solana/web3.js'
import { supabaseAdmin } from '../supabaseServer'

const USDC_DECIMALS = 6
const CONFIRMATION_TIMEOUT_MS = 30_000
const CONFIRMATION_POLL_INTERVAL_MS = 1_000

export type VerifiedDeposit = {
  amountUsdc: number
  sourceAta: string
}

export type DepositVerificationFailure = {
  reason: string
  details?: Record<string, unknown>
}

export type DepositVerificationResult = VerifiedDeposit | DepositVerificationFailure

export async function verifyTransfer(
  signature: string,
  user: { id: string }
): Promise<DepositVerificationResult> {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) {
    throw new Error('Server configuration error: missing SOLANA_RPC_URL')
  }

  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
  const usdcMint = process.env.USDC_MINT_ADDRESS
  if (!platformAddress || !usdcMint) {
    throw new Error('Server configuration error: missing PLATFORM_SOLANA_ADDRESS or USDC_MINT_ADDRESS')
  }

  const connection = new Connection(rpcUrl, 'finalized')

  const { data: userData, error: userError } = await supabaseAdmin
    .from('users')
    .select('wallet_address, custodial_wallet_address')
    .eq('id', user.id)
    .single()

  if (userError || !userData) {
    throw new Error('Unable to fetch user')
  }

  const { data: linkedWallets } = await supabaseAdmin
    .from('linked_wallets')
    .select('address')
    .eq('user_id', user.id)

  const userAddresses = [
    userData.wallet_address,
    userData.custodial_wallet_address,
    ...((linkedWallets as { address: string }[] | null) ?? []).map((w) => w.address),
  ].filter((addr): addr is string => typeof addr === 'string' && addr.length > 0)

  const userOwnerSet = new Set<string>(userAddresses)

  const waitForFinalizedTx = async () => {
    const start = Date.now()
    while (Date.now() - start < CONFIRMATION_TIMEOUT_MS) {
      const parsedTx = await connection.getParsedTransaction(signature, {
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      })
      if (parsedTx) return parsedTx
      await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_POLL_INTERVAL_MS))
    }
    return null
  }

  const parsedTx = await waitForFinalizedTx()

  if (!parsedTx) {
    return { reason: 'Transaction not found or not yet finalized' }
  }

  if (parsedTx.meta?.err) {
    return { reason: 'Transaction failed on-chain' }
  }

  if (!parsedTx.meta) {
    return { reason: 'Transaction metadata not available' }
  }

  const preMap = new Map<number, { owner: string; mint: string; amount: string }>()
  for (const bal of parsedTx.meta.preTokenBalances ?? []) {
    if (!bal.owner || !bal.mint) continue
    preMap.set(bal.accountIndex, { owner: bal.owner, mint: bal.mint, amount: bal.uiTokenAmount.amount })
  }

  const postMap = new Map<number, { owner: string; mint: string; amount: string }>()
  for (const bal of parsedTx.meta.postTokenBalances ?? []) {
    if (!bal.owner || !bal.mint) continue
    postMap.set(bal.accountIndex, { owner: bal.owner, mint: bal.mint, amount: bal.uiTokenAmount.amount })
  }

  const allAccountIndices = new Set<number>()
  for (const idx of preMap.keys()) allAccountIndices.add(idx)
  for (const idx of postMap.keys()) allAccountIndices.add(idx)

  const usdcChanges: { accountIndex: number; owner: string; pre: string; post: string; delta: string }[] = []
  let platformDelta = BigInt(0)
  let matchedSourceOwner: string | null = null
  let largestNegativeDelta = BigInt(0)

  for (const idx of allAccountIndices) {
    const pre = preMap.get(idx)
    const post = postMap.get(idx)
    const mint = post?.mint ?? pre?.mint
    const owner = post?.owner ?? pre?.owner
    if (!mint || !owner || mint !== usdcMint) continue

    const preAmount = pre?.amount ?? '0'
    const postAmount = post?.amount ?? '0'
    const delta = BigInt(postAmount) - BigInt(preAmount)

    usdcChanges.push({ accountIndex: idx, owner, pre: preAmount, post: postAmount, delta: delta.toString() })

    if (owner === platformAddress) {
      platformDelta += delta
    }

    if (owner !== platformAddress && delta < BigInt(0) && -delta > largestNegativeDelta) {
      largestNegativeDelta = -delta
      matchedSourceOwner = owner
    }
  }

  if (platformDelta <= BigInt(0)) {
    return {
      reason: 'No USDC transfer to platform found in transaction',
      details: {
        mint: usdcMint,
        platform_owner: platformAddress,
        usdc_balance_changes: usdcChanges,
      },
    }
  }

  if (!matchedSourceOwner) {
    return {
      reason: 'Could not identify the source USDC account for the deposit',
      details: {
        mint: usdcMint,
        platform_owner: platformAddress,
        usdc_balance_changes: usdcChanges,
      },
    }
  }

  if (!userOwnerSet.has(matchedSourceOwner)) {
    return {
      reason: `This USDC transfer was not sent from a wallet linked to your account. It came from ${matchedSourceOwner}. Please link this wallet on the Account page and try again.`,
      details: { source: matchedSourceOwner, usdc_balance_changes: usdcChanges },
    }
  }

  const amountUsdc = Number(platformDelta) / 10 ** USDC_DECIMALS

  return { amountUsdc, sourceAta: matchedSourceOwner }
}
