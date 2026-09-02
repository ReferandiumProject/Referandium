// @ts-nocheck
import fs from 'fs'
import { Connection, PublicKey } from '@solana/web3.js'
import { getMint, getAccount } from '@solana/spl-token'
import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2/lib/raydium/cpmm/layout.js'
import { revokeMintAuthority, completeGraduation } from '@/lib/graduation/revoke'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getCpmmProgramInfo } from '@/lib/graduation/cpmm'

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
const SNTL_DECIMALS = 6
const USDC_DECIMALS = 6
const EXPECTED_SUPPLY = BigInt(100_000_000) * BigInt(10 ** SNTL_DECIMALS)
const EXPECTED_POOL_SNTL = BigInt(22_904_258) * BigInt(10 ** SNTL_DECIMALS) + BigInt(443_716)
const EXPECTED_POOL_USDC = BigInt(6) * BigInt(10 ** USDC_DECIMALS) + BigInt(732_001)

function formatAmount(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const int = s.slice(0, -decimals) || '0'
  const frac = s.slice(-decimals)
  return `${int}.${frac}`
}

async function verify(sntMint: PublicKey, grad: any) {
  const mintInfo = await getMint(connection, sntMint, 'finalized')

  console.log('\n=== Mint verification ===')
  console.log('Mint address:', sntMint.toBase58())
  console.log('Supply (base units):', mintInfo.supply.toString())
  console.log('Supply:', formatAmount(BigInt(mintInfo.supply), SNTL_DECIMALS))
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58() ?? 'null')
  console.log('Freeze authority:', mintInfo.freezeAuthority?.toBase58() ?? 'null')

  if (mintInfo.mintAuthority !== null) throw new Error('Mint authority is not null')
  if (mintInfo.freezeAuthority !== null) throw new Error('Freeze authority is not null')
  if (BigInt(mintInfo.supply) !== EXPECTED_SUPPLY) {
    throw new Error(`Expected supply ${EXPECTED_SUPPLY}, got ${mintInfo.supply}`)
  }

  let escrowBalance = BigInt(0)
  if (grad.escrow_address) {
    try {
      const escrow = await getAccount(connection, new PublicKey(grad.escrow_address), 'finalized')
      escrowBalance = BigInt(escrow.amount)
    } catch {
      // account may not exist
    }
  }
  console.log('\nEscrow balance (base units):', escrowBalance.toString())
  console.log('Escrow balance:', formatAmount(escrowBalance, SNTL_DECIMALS))

  if (escrowBalance !== BigInt(0)) throw new Error('Escrow is not empty')

  const poolAddress = new PublicKey(grad.pool_address)
  const poolAccount = await connection.getAccountInfo(poolAddress, 'finalized')
  if (!poolAccount) throw new Error(`Pool account ${poolAddress.toBase58()} not found`)

  const cpmm = getCpmmProgramInfo('devnet')
  if (poolAccount.owner.toBase58() !== cpmm.programId.toBase58()) {
    throw new Error(`Pool owner ${poolAccount.owner.toBase58()} does not match devnet CPMM program`)
  }

  const pool = CpmmPoolInfoLayout.decode(Buffer.from(poolAccount.data))
  const [vaultA, vaultB] = await Promise.all([
    getAccount(connection, new PublicKey(pool.vaultA), 'finalized'),
    getAccount(connection, new PublicKey(pool.vaultB), 'finalized'),
  ])

  const sntMintString = sntMint.toBase58()
  const sntIsA = new PublicKey(pool.mintA).toBase58() === sntMintString
  const sntReserve = sntIsA ? BigInt(vaultA.amount) : BigInt(vaultB.amount)
  const usdcReserve = sntIsA ? BigInt(vaultB.amount) : BigInt(vaultA.amount)

  console.log('\n=== Pool verification ===')
  console.log('Pool address:', poolAddress.toBase58())
  console.log('Pool owner:', poolAccount.owner.toBase58())
  console.log('SNTL reserve:', formatAmount(sntReserve, SNTL_DECIMALS))
  console.log('USDC reserve:', formatAmount(usdcReserve, USDC_DECIMALS))

  if (sntReserve !== EXPECTED_POOL_SNTL) {
    throw new Error(`Expected SNTL reserve ${EXPECTED_POOL_SNTL}, got ${sntReserve}`)
  }
  if (usdcReserve !== EXPECTED_POOL_USDC) {
    throw new Error(`Expected USDC reserve ${EXPECTED_POOL_USDC}, got ${usdcReserve}`)
  }
}

async function main() {
  const { data: grad, error } = await supabaseAdmin
    .from('graduations')
    .select('mint_address, escrow_address, pool_address, status')
    .eq('id', graduationId)
    .single()
  if (error || !grad) throw new Error(`Could not load graduation: ${error?.message}`)

  const sntMint = new PublicKey(grad.mint_address)

  const { txId, already } = await revokeMintAuthority(graduationId)
  console.log('\n=== Revoke result ===')
  console.log('Already revoked:', already ?? false)
  console.log('Authority revoke signature:', txId)

  await verify(sntMint, grad)

  const complete = await completeGraduation(graduationId, txId)
  console.log('\n=== Complete result ===')
  console.log('Authority revoke signature recorded:', complete.authorityRevokeSignature)
  console.log('Ledger liability before:', formatAmount(BigInt(complete.ledgerLiabilityBefore), USDC_DECIMALS))
  console.log('Ledger liability after:', formatAmount(BigInt(complete.ledgerLiabilityAfter), USDC_DECIMALS))
  console.log(
    'Ledger liability drop:',
    formatAmount(BigInt(complete.ledgerLiabilityBefore) - BigInt(complete.ledgerLiabilityAfter), USDC_DECIMALS)
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[revoke] failed:', err)
    process.exit(1)
  })
