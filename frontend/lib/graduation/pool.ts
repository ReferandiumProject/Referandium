import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token'
import BN from 'bn.js'
import bs58 from 'bs58'
import {
  Raydium,
  TxVersion,
  CpmmPoolInfoLayout,
  getCpmmPdaAmmConfigId,
  DEVNET_PROGRAM_ID,
  DEV_API_URLS,
} from '@raydium-io/raydium-sdk-v2'

import { supabaseAdmin } from '@/lib/supabaseServer'
import { TokenAmount } from '@/lib/token-amount'
import { Decimal } from '@/lib/decimal'
import { halt, transition, type SupabaseType } from './state'
import { getClusterFromUrl, getCpmmProgramInfo } from './cpmm'

const USDC_DECIMALS = 6

export interface PoolDeps {
  supabase?: typeof supabaseAdmin
  connection?: Connection
  platformKeypair?: Keypair
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
    .select(
      'id, status, mint_address, pool_address, tokens_to_lp::text, dust_to_lp::text, liquidity_usdc::text'
    )
    .eq('id', graduationId)
    .single()

  if (error || !grad) {
    throw new Error(`Could not load graduation: ${error?.message ?? 'not found'}`)
  }

  return {
    id: grad.id as string,
    status: grad.status as string,
    mintAddress: grad.mint_address as string,
    poolAddress: grad.pool_address as string | null,
    tokensToLp: grad.tokens_to_lp as string,
    dustToLp: grad.dust_to_lp as string,
    liquidityUsdc: grad.liquidity_usdc as string,
  }
}

async function getOrCreateTokenInfo(
  connection: Connection,
  mint: PublicKey
): Promise<{ address: string; decimals: number; programId: string }> {
  const mintInfo = await getMint(connection, mint, 'finalized')
  return {
    address: mint.toBase58(),
    decimals: mintInfo.decimals,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  }
}

type ExistingPool = {
  poolId: string
  lpMint: string
  vaultA: string
  vaultB: string
}

async function findExistingCpmmPool(
  connection: Connection,
  programId: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<ExistingPool | 'multiple' | null> {
  const makeFilters = (a: PublicKey, b: PublicKey) => [
    { dataSize: CpmmPoolInfoLayout.span },
    { memcmp: { offset: 168, bytes: a.toBase58() } },
    { memcmp: { offset: 200, bytes: b.toBase58() } },
  ]

  const [forward, reverse] = await Promise.all([
    connection.getProgramAccounts(programId, {
      filters: makeFilters(mintA, mintB),
      commitment: 'finalized',
      encoding: 'base64',
    }),
    connection.getProgramAccounts(programId, {
      filters: makeFilters(mintB, mintA),
      commitment: 'finalized',
      encoding: 'base64',
    }),
  ])

  const seen = new Set<string>()
  const matches: { account: any; pubkey: PublicKey }[] = []

  for (const list of [forward, reverse]) {
    for (const item of list) {
      const id = item.pubkey.toBase58()
      if (seen.has(id)) continue
      seen.add(id)
      matches.push(item)
    }
  }

  if (matches.length > 1) return 'multiple'
  if (matches.length === 0) return null

  const { account, pubkey } = matches[0]
  const data = Buffer.isBuffer(account.data)
    ? account.data
    : Buffer.from(account.data as any)
  const decoded = CpmmPoolInfoLayout.decode(data) as any

  return {
    poolId: pubkey.toBase58(),
    lpMint: decoded.mintLp.toBase58(),
    vaultA: decoded.vaultA.toBase58(),
    vaultB: decoded.vaultB.toBase58(),
  }
}

async function printPoolVerification(
  connection: Connection,
  sntMint: PublicKey,
  usdcMint: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  lpAta: PublicKey
) {
  const [vaultABal, vaultBBal, lpBal] = await Promise.all([
    connection.getTokenAccountBalance(vaultA, 'finalized'),
    connection.getTokenAccountBalance(vaultB, 'finalized'),
    connection.getTokenAccountBalance(lpAta, 'finalized'),
  ])

  const sntIsA = Buffer.compare(sntMint.toBuffer(), usdcMint.toBuffer()) < 0
  const sntReserveBase = sntIsA
    ? BigInt(vaultABal.value.amount)
    : BigInt(vaultBBal.value.amount)
  const usdcReserveBase = sntIsA
    ? BigInt(vaultBBal.value.amount)
    : BigInt(vaultABal.value.amount)

  const sntReserve = new Decimal(sntReserveBase, USDC_DECIMALS)
  const usdcReserve = new Decimal(usdcReserveBase, USDC_DECIMALS)
  const price = usdcReserve.div(sntReserve, 12).toFixed(12)

  console.log('=== Pool on-chain verification ===')
  console.log('SNTL reserve:', sntReserve.toString())
  console.log('USDC reserve:', usdcReserve.toString())
  console.log(
    'LP amount:',
    lpBal.value.uiAmountString ??
      new Decimal(
        BigInt(lpBal.value.amount),
        lpBal.value.decimals
      ).toString()
  )
  console.log('Price of one SNTL (USDC):', price)
}

export async function createGraduationPool(
  graduationId: string,
  deps: PoolDeps = {}
): Promise<{ success: boolean; poolAddress?: string; reason?: string }> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()
  const platformPubkey = platformKeypair.publicKey

  const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS!)
  const grad = await loadGraduation(supabase, graduationId)

  if (grad.status === 'pooled' && grad.poolAddress) {
    console.log('Graduation is already pooled:', grad.id)
    return { success: true, poolAddress: grad.poolAddress }
  }

  if (grad.status !== 'minted' && grad.status !== 'pooling') {
    const reason = `Cannot create pool from status ${grad.status}`
    await halt(supabase, graduationId, grad.status, reason)
    return { success: false, reason }
  }

  const sntMint = new PublicKey(grad.mintAddress)
  const sntBase =
    TokenAmount.fromDatabase(grad.tokensToLp, USDC_DECIMALS).toBaseUnit() +
    TokenAmount.fromDatabase(grad.dustToLp, USDC_DECIMALS).toBaseUnit()
  const usdcBase = TokenAmount.fromDatabase(
    grad.liquidityUsdc,
    USDC_DECIMALS
  ).toBaseUnit()

  const cluster = getClusterFromUrl(connection.rpcEndpoint)
  const cpmm = getCpmmProgramInfo(cluster)

  const existing = await findExistingCpmmPool(
    connection,
    cpmm.programId,
    sntMint,
    usdcMint
  )

  if (existing === 'multiple') {
    const reason = 'Multiple existing CPMM pools found for this mint pair; cannot choose'
    await halt(supabase, graduationId, grad.status, reason)
    return { success: false, reason }
  }

  if (existing) {
    const lpMint = new PublicKey(existing.lpMint)
    const lpAta = getAssociatedTokenAddressSync(lpMint, platformPubkey)
    let lpAmount = '0'
    try {
      const lpAccount = await connection.getTokenAccountBalance(lpAta, 'finalized')
      lpAmount =
        lpAccount.value.uiAmountString ??
        new Decimal(BigInt(lpAccount.value.amount), lpAccount.value.decimals).toString()
    } catch (err) {
      console.warn('Could not read LP token account balance:', err)
    }
    const updates = {
      pool_address: existing.poolId,
      lp_mint_address: existing.lpMint,
      lp_token_account: lpAta.toBase58(),
      lp_amount: lpAmount,
    }
    await transition(
      supabase,
      graduationId,
      grad.status,
      'pooled',
      updates,
      'Existing CPMM pool found on chain; recorded without creation'
    )
    return { success: true, poolAddress: existing.poolId }
  }

  const platformSntAta = getAssociatedTokenAddressSync(sntMint, platformPubkey)
  const platformUsdcAta = getAssociatedTokenAddressSync(
    usdcMint,
    platformPubkey
  )

  const [sntBal, usdcBal] = await Promise.all([
    (async () => {
      try {
        const { value } = await connection.getTokenAccountBalance(
          platformSntAta,
          'finalized'
        )
        return BigInt(value.amount)
      } catch {
        return BigInt(0)
      }
    })(),
    (async () => {
      try {
        const { value } = await connection.getTokenAccountBalance(
          platformUsdcAta,
          'finalized'
        )
        return BigInt(value.amount)
      } catch {
        return BigInt(0)
      }
    })(),
  ])

  if (sntBal < sntBase || usdcBal < usdcBase) {
    const reason =
      `Insufficient pool tokens. ` +
      `SNTL available ${new Decimal(sntBal, USDC_DECIMALS).toString()}, ` +
      `required ${new Decimal(sntBase, USDC_DECIMALS).toString()}; ` +
      `USDC available ${new Decimal(usdcBal, USDC_DECIMALS).toString()}, ` +
      `required ${new Decimal(usdcBase, USDC_DECIMALS).toString()}`
    await halt(supabase, graduationId, grad.status, reason)
    return { success: false, reason }
  }

  const raydium = await Raydium.load({
    owner: platformKeypair,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'finalized',
    ...(cluster === 'devnet' ? { urlConfigs: DEV_API_URLS } : {}),
  })

  const feeConfigs = await raydium.api.getCpmmConfigs()
  const feeConfig = feeConfigs[0]
  if (cluster === 'devnet') {
    feeConfig.id = getCpmmPdaAmmConfigId(
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      feeConfig.index
    ).publicKey.toBase58()
  }

  const [sntToken, usdcToken] = await Promise.all([
    getOrCreateTokenInfo(connection, sntMint),
    getOrCreateTokenInfo(connection, usdcMint),
  ])

  if (grad.status === 'minted') {
    await transition(
      supabase,
      graduationId,
      grad.status,
      'pooling',
      {},
      'Creating Raydium CPMM pool'
    )
  }

  try {
    const { execute, extInfo } = await raydium.cpmm.createPool({
      programId: cpmm.programId,
      poolFeeAccount: cpmm.feeAccount,
      mintA: sntToken,
      mintB: usdcToken,
      mintAAmount: new BN(sntBase.toString()),
      mintBAmount: new BN(usdcBase.toString()),
      startTime: new BN(0),
      feeConfig,
      associatedOnly: false,
      ownerInfo: { useSOLBalance: true },
      txVersion: TxVersion.V0,
      addSupportMintExt: true,
    })

    const { txId } = await execute({ sendAndConfirm: true })

    const lpMint = extInfo.address.lpMint
    const lpAta = getAssociatedTokenAddressSync(lpMint, platformPubkey)
    const lpAccount = await connection.getTokenAccountBalance(lpAta, 'finalized')
    const lpAmount =
      lpAccount.value.uiAmountString ??
      new Decimal(BigInt(lpAccount.value.amount), lpAccount.value.decimals).toString()

    const updates = {
      pool_address: extInfo.address.poolId.toBase58(),
      pool_signature: txId,
      lp_mint_address: lpMint.toBase58(),
      lp_token_account: lpAta.toBase58(),
      lp_amount: lpAmount,
    }

    await transition(
      supabase,
      graduationId,
      'pooling',
      'pooled',
      updates,
      `Pool created. LP ${lpAmount}`
    )

    await printPoolVerification(
      connection,
      sntMint,
      usdcMint,
      extInfo.address.vaultA,
      extInfo.address.vaultB,
      lpAta
    )

    return { success: true, poolAddress: updates.pool_address }
  } catch (err: any) {
    const raw = err?.message ?? String(err)
    const reason = `Pool creation failed: ${raw}`
    await halt(supabase, graduationId, 'pooling', reason)
    return { success: false, reason }
  }
}
