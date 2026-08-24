import { NextResponse } from 'next/server'
import { Connection } from '@solana/web3.js'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'

const USDC_DECIMALS = 6
const CONFIRMATION_TIMEOUT_MS = 30_000
const CONFIRMATION_POLL_INTERVAL_MS = 1_000

export async function POST(request: Request) {
  console.log('[api/deposit] confirm request received')

  try {
    let user
    try {
      user = await getAuthenticatedUser(request)
      console.log('[api/deposit] authenticated user:', user.id)
    } catch {
      console.log('[api/deposit] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { signature } = await request.json()
    console.log('[api/deposit] confirming signature:', signature)

    if (!signature || typeof signature !== 'string') {
      console.log('[api/deposit] missing signature')
      return NextResponse.json({ error: 'signature is required' }, { status: 400 })
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      console.error('[api/deposit] missing SOLANA_RPC_URL env var')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
    const usdcMint = process.env.USDC_MINT_ADDRESS
    if (!platformAddress || !usdcMint) {
      console.error('[api/deposit] missing PLATFORM_SOLANA_ADDRESS or USDC_MINT_ADDRESS env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const connection = new Connection(rpcUrl, 'finalized')

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('wallet_address, custodial_wallet_address')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      console.error('[api/deposit] user lookup failed:', userError)
      return NextResponse.json({ error: 'Unable to fetch user' }, { status: 500 })
    }

    // Only use addresses with server-verified provenance for deposit attribution.
    // connected_wallet_address was intentionally excluded because it has no
    // verified population path today; including it would let a client-written
    // value silently authorize deposit theft the moment wallet linking is added.
    // linked_wallets entries are added because they require an ed25519-signed
    // challenge and are therefore proof-of-ownership verified.
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
    console.log('[api/deposit] user owners:', Array.from(userOwnerSet))

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
      console.log('[api/deposit] transaction not found or not finalized')
      return NextResponse.json({ error: 'Transaction not found or not yet finalized' }, { status: 400 })
    }

    if (parsedTx.meta?.err) {
      console.log('[api/deposit] transaction failed on-chain')
      return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 })
    }

    if (!parsedTx.meta) {
      console.log('[api/deposit] transaction metadata not available')
      return NextResponse.json({ error: 'Transaction metadata not available' }, { status: 400 })
    }

    console.log('[api/deposit] verifying USDC balance deltas by owner')
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
      console.log('[api/deposit] no USDC transfer to platform found')
      return NextResponse.json(
        {
          error: 'No USDC transfer to platform found in transaction',
          mint: usdcMint,
          platform_owner: platformAddress,
          usdc_balance_changes: usdcChanges,
        },
        { status: 400 }
      )
    }

    if (!matchedSourceOwner) {
      console.log('[api/deposit] no source USDC account found')
      return NextResponse.json(
        {
          error: 'Could not identify the source USDC account for the deposit',
          mint: usdcMint,
          platform_owner: platformAddress,
          usdc_balance_changes: usdcChanges,
        },
        { status: 400 }
      )
    }

    // Any address used for deposit attribution must have server-verified provenance.
    // Do not add connected_wallet_address here without an equally trusted population path.
    if (!userOwnerSet.has(matchedSourceOwner)) {
      console.log('[api/deposit] source owner not in user whitelist')
      return NextResponse.json(
        {
          error: `This USDC transfer was not sent from a wallet linked to your account. It came from ${matchedSourceOwner}. Please link this wallet on the Account page and try again.`,
          source: matchedSourceOwner,
          usdc_balance_changes: usdcChanges,
        },
        { status: 400 }
      )
    }

    const creditedAmount = Number(platformDelta) / 10 ** USDC_DECIMALS

    const { data, error } = await supabaseAdmin.rpc('confirm_deposit', {
      p_user_id: user.id,
      p_signature: signature,
      p_amount_usdc: creditedAmount,
      p_source_ata: matchedSourceOwner,
    })

    if (error) {
      const isUniqueViolation =
        error.code === '23505' ||
        (typeof error.message === 'string' && error.message.includes('deposits_signature_key'))

      if (isUniqueViolation) {
        console.log('[api/deposit] duplicate signature detected')
        return NextResponse.json({ error: 'This deposit has already been credited' }, { status: 400 })
      }

      console.error('[api/deposit] confirm_deposit RPC failed:', error)
      return NextResponse.json({ error: 'Unable to update balance' }, { status: 500 })
    }

    console.log('[api/deposit] deposit confirmed, new balance:', data.new_balance)
    return NextResponse.json({ credited_amount: creditedAmount, new_balance: data.new_balance })
  } catch (error: any) {
    console.error('[api/deposit] unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
