// @ts-nocheck
import fs from 'fs'
import { Connection, PublicKey } from '@solana/web3.js'
import { getMint, getAccount } from '@solana/spl-token'
import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2/lib/raydium/cpmm/layout.js'
import { burnLpTokens } from '@/lib/graduation/burn'
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
const graduationId = process.env.GRADUATION_ID ?? '7abff8a6-f3e2-4d64-a286-3cd37c6bf185'

if (!rpcUrl) throw new Error('Missing SOLANA_RPC_URL')

const connection = new Connection(rpcUrl, 'finalized')

function formatAmount(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const int = s.slice(0, -decimals) || '0'
  const frac = s.slice(-decimals)
  return `${int}.${frac}`
}

async function main() {
  const result = await burnLpTokens(graduationId)
  console.log('\n=== Burn result ===')
  console.log(JSON.stringify(result, null, 2))

  const { data: grad, error } = await supabaseAdmin
    .from('graduations')
    .select('lp_mint_address, lp_token_account, pool_address, mint_address')
    .eq('id', graduationId)
    .single()
  if (error || !grad) throw new Error(`Could not load graduation: ${error?.message}`)

  const lpMint = new PublicKey(grad.lp_mint_address)
  const lpTokenAccount = new PublicKey(grad.lp_token_account)
  const [lpMintInfo, lpAccount] = await Promise.all([
    getMint(connection, lpMint, 'finalized'),
    getAccount(connection, lpTokenAccount, 'finalized'),
  ])

  console.log('\n=== Post-burn verification ===')
  console.log('LP mint supply (base units):', lpMintInfo.supply.toString())
  console.log('LP mint supply:', formatAmount(BigInt(lpMintInfo.supply), lpMintInfo.decimals))
  console.log('Our LP token account balance (base units):', lpAccount.amount.toString())
  console.log('Our LP token account balance:', formatAmount(BigInt(lpAccount.amount), lpMintInfo.decimals))

  const poolAddress = new PublicKey(grad.pool_address)
  const poolAccount = await connection.getAccountInfo(poolAddress, 'finalized')
  if (!poolAccount) throw new Error(`Pool account ${poolAddress.toBase58()} not found`)

  const pool = CpmmPoolInfoLayout.decode(Buffer.from(poolAccount.data))
  console.log('\nPool owner:', poolAccount.owner.toBase58())

  const [vaultA, vaultB] = await Promise.all([
    getAccount(connection, new PublicKey(pool.vaultA), 'finalized'),
    getAccount(connection, new PublicKey(pool.vaultB), 'finalized'),
  ])

  const sntMint = new PublicKey(grad.mint_address)
  const sntIsA = new PublicKey(pool.mintA).toBase58() === sntMint.toBase58()

  const sntReserve = sntIsA ? BigInt(vaultA.amount) : BigInt(vaultB.amount)
  const usdcReserve = sntIsA ? BigInt(vaultB.amount) : BigInt(vaultA.amount)
  const sntDecimals = sntIsA ? pool.mintDecimalA : pool.mintDecimalB
  const usdcDecimals = sntIsA ? pool.mintDecimalB : pool.mintDecimalA

  console.log('SNTL reserve:', formatAmount(sntReserve, sntDecimals))
  console.log('USDC reserve:', formatAmount(usdcReserve, usdcDecimals))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[burn-lp] failed:', err)
    process.exit(1)
  })
