// @ts-nocheck
import fs from 'fs'
import { Connection, PublicKey } from '@solana/web3.js'
import { getMint, getAccount } from '@solana/spl-token'
import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2/lib/raydium/cpmm/layout.js'
import { getCpmmProgramInfo, getClusterFromUrl } from '@/lib/graduation/cpmm'
import { supabaseAdmin } from '@/lib/supabaseServer'

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) {
    try {
      ;(process as any).loadEnvFile?.(file)
    } catch {
      // ignore on older Node versions
    }
  }
}

const rpcUrl = process.env.SOLANA_RPC_URL
const usdcMintAddress = process.env.USDC_MINT_ADDRESS
const platformPrivateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY

if (!rpcUrl || !usdcMintAddress || !platformPrivateKey) {
  throw new Error('Missing SOLANA_RPC_URL, USDC_MINT_ADDRESS or PLATFORM_WALLET_PRIVATE_KEY')
}

const connection = new Connection(rpcUrl, 'finalized')
const usdcMint = new PublicKey(usdcMintAddress)
const cpmm = getCpmmProgramInfo(getClusterFromUrl(rpcUrl))

function formatUiAmount(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const int = s.slice(0, -decimals) || '0'
  const frac = s.slice(-decimals)
  return `${int}.${frac}`
}

async function inspectPool(poolAddress: PublicKey) {
  const account = await connection.getAccountInfo(poolAddress, 'finalized')
  if (!account) throw new Error(`Pool account ${poolAddress.toBase58()} not found`)

  const owner = account.owner.toBase58()
  const isCpmm = owner === cpmm.programId.toBase58()

  const pool = CpmmPoolInfoLayout.decode(Buffer.from(account.data))

  const [mintA, mintB] = [new PublicKey(pool.mintA), new PublicKey(pool.mintB)]
  const [vaultA, vaultB] = [new PublicKey(pool.vaultA), new PublicKey(pool.vaultB)]
  const mintLp = new PublicKey(pool.mintLp)
  const lpDecimals = pool.lpDecimals
  const mintADecimals = pool.mintDecimalA
  const mintBDecimals = pool.mintDecimalB

  const mintAInfo = await getMint(connection, mintA, 'finalized')
  const mintBInfo = await getMint(connection, mintB, 'finalized')
  const mintLpInfo = await getMint(connection, mintLp, 'finalized')

  const [vaultAAccount, vaultBAccount] = await Promise.all([
    getAccount(connection, vaultA, 'finalized'),
    getAccount(connection, vaultB, 'finalized'),
  ])

  const reserveA = BigInt(vaultAAccount.amount)
  const reserveB = BigInt(vaultBAccount.amount)

  const lpTotalSupply = BigInt(mintLpInfo.supply)

  return {
    poolAddress: poolAddress.toBase58(),
    owner,
    isCpmm,
    mintA: mintA.toBase58(),
    mintB: mintB.toBase58(),
    mintADecimals,
    mintBDecimals,
    vaultA: vaultA.toBase58(),
    vaultB: vaultB.toBase58(),
    reserveA,
    reserveB,
    reserveAUi: formatUiAmount(reserveA, mintADecimals),
    reserveBUi: formatUiAmount(reserveB, mintBDecimals),
    mintLp: mintLp.toBase58(),
    lpDecimals,
    lpTotalSupply,
    lpTotalSupplyUi: formatUiAmount(lpTotalSupply, lpDecimals),
  }
}

async function findAllCpmmPoolsForMints(mintA: PublicKey, mintB: PublicKey) {
  const results: any[] = []

  // CPMM pool layout: 8-byte header, then configId, poolCreator, vaultA, vaultB, mintLp, mintA, mintB
  // offsets: configId 8, poolCreator 40, vaultA 72, vaultB 104, mintLp 136, mintA 168, mintB 200
  const dataSize = CpmmPoolInfoLayout.span ?? 637 // fallback; will be refined after first decode

  const filters = [
    { dataSize },
    { memcmp: { offset: 168, bytes: mintA.toBase58() } },
    { memcmp: { offset: 200, bytes: mintB.toBase58() } },
  ]

  const [aFirst, bFirst] = await Promise.all([
    connection.getProgramAccounts(cpmm.programId, { filters }),
    connection.getProgramAccounts(cpmm.programId, {
      filters: [
        { dataSize },
        { memcmp: { offset: 168, bytes: mintB.toBase58() } },
        { memcmp: { offset: 200, bytes: mintA.toBase58() } },
      ],
    }),
  ])

  for (const { pubkey, account } of [...aFirst, ...bFirst]) {
    const pool = CpmmPoolInfoLayout.decode(Buffer.from(account.data))
    const pa = new PublicKey(pubkey)
    results.push({
      poolAddress: pa.toBase58(),
      mintA: new PublicKey(pool.mintA).toBase58(),
      mintB: new PublicKey(pool.mintB).toBase58(),
      vaultA: new PublicKey(pool.vaultA).toBase58(),
      vaultB: new PublicKey(pool.vaultB).toBase58(),
      mintLp: new PublicKey(pool.mintLp).toBase58(),
    })
  }

  return results
}

async function main() {
  const { data: graduations, error } = await supabaseAdmin
    .from('graduations')
    .select('id, mint_address, pool_address, lp_mint_address, lp_token_account')
    .not('pool_address', 'is', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!graduations || graduations.length === 0) {
    console.log('[verify-pool] no pooled graduations found in database')
    return
  }

  console.log(`[verify-pool] recorded graduations with pool_address: ${graduations.length}`)

  const sntMintSet = new Set<string>()
  const recordSummaries: any[] = []

  for (const grad of graduations) {
    const sntMint = new PublicKey(grad.mint_address)
    sntMintSet.add(grad.mint_address)

    const poolAddress = new PublicKey(grad.pool_address)
    const pool = await inspectPool(poolAddress)

    let ourLpBalance = BigInt(0)
    if (grad.lp_token_account) {
      try {
        const acc = await getAccount(connection, new PublicKey(grad.lp_token_account), 'finalized')
        ourLpBalance = BigInt(acc.amount)
      } catch (err: any) {
        console.log(`[verify-pool] could not read LP token account ${grad.lp_token_account}:`, err.message)
      }
    }

    const percentHeld =
      pool.lpTotalSupply > 0n
        ? ((Number(ourLpBalance) / Number(pool.lpTotalSupply)) * 100).toFixed(6)
        : '0'

    recordSummaries.push({
      graduation_id: grad.id,
      snt_mint: grad.mint_address,
      ...pool,
      our_lp_token_account: grad.lp_token_account,
      our_lp_balance: ourLpBalance.toString(),
      our_lp_balance_ui: formatUiAmount(ourLpBalance, pool.lpDecimals),
      lp_total_supply: pool.lpTotalSupply.toString(),
      lp_total_supply_ui: pool.lpTotalSupplyUi,
      percent_we_hold: `${percentHeld}%`,
    })
  }

  // Normalize vaults so SNTL is always reported as reserveA and USDC as reserveB
  const normalized = recordSummaries.map((p: any) => {
    const isSntlA = p.mintA === [...sntMintSet][0] && p.mintA.toBase58 === undefined ? p.mintA : p.mintA // already string
    const isSntlAFlag = p.mintA === [...sntMintSet][0]
    const [sntReserveUi, usdcReserveUi] = isSntlAFlag ? [p.reserveAUi, p.reserveBUi] : [p.reserveBUi, p.reserveAUi]
    const [sntReserve, usdcReserve] = isSntlAFlag
      ? [p.reserveA.toString(), p.reserveB.toString()]
      : [p.reserveB.toString(), p.reserveA.toString()]

    return {
      ...p,
      snt_reserve: sntReserve,
      snt_reserve_ui: sntReserveUi,
      usdc_reserve: usdcReserve,
      usdc_reserve_ui: usdcReserveUi,
      snt_mint_in_pool: isSntlAFlag ? p.mintA : p.mintB,
      usdc_mint_in_pool: isSntlAFlag ? p.mintB : p.mintA,
      usdc_mint_expected: usdcMint.toBase58(),
    }
  })

  console.log('\n=== Recorded pools ===')
  const toJson = (_: string, v: any) => (typeof v === 'bigint' ? v.toString() : v)
  for (const p of normalized) {
    console.log(JSON.stringify(p, toJson, 2))
  }

  // Scan the chain for all CPMM pools for any SNTL mint vs USDC
  console.log('\n=== On-chain scan for SNTL/USDC CPMM pools ===')
  const allFoundPools: any[] = []

  for (const sntMintAddress of sntMintSet) {
    const sntMint = new PublicKey(sntMintAddress)
    const found = await findAllCpmmPoolsForMints(sntMint, usdcMint)
    allFoundPools.push(...found)
  }

  if (allFoundPools.length === 0) {
    console.log('[verify-pool] no on-chain CPMM pools found for the SNTL/USDC pair')
  } else {
    console.log(`[verify-pool] found ${allFoundPools.length} CPMM pool(s) for SNTL/USDC:`)
    for (const p of allFoundPools) {
      console.log(JSON.stringify(p, null, 2))
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[verify-pool] failed:', err)
    process.exit(1)
  })
