import { Connection, PublicKey } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'
import { CpmmPoolInfoLayout } from '@raydium-io/raydium-sdk-v2/lib/raydium/cpmm/layout.js'
import { getCpmmProgramInfo, getClusterFromUrl } from './cpmm'
import { Decimal } from '@/lib/decimal'

function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL is not set')
  return new Connection(rpcUrl, 'finalized')
}

function getUsdcMint(): PublicKey {
  const usdcMintAddress = process.env.USDC_MINT_ADDRESS
  if (!usdcMintAddress) throw new Error('USDC_MINT_ADDRESS is not set')
  return new PublicKey(usdcMintAddress)
}

/**
 * Reads the on-chain CPMM pool for the given graduation and returns the
 * current token price as USDC per token (token / USDC).
 *
 * The price is returned as a decimal string so it never passes through a
 * JavaScript floating-point number.
 */
export async function readPoolPrice(
  poolAddress: string,
  tokenMintAddress: string
): Promise<string> {
  const connection = getConnection()
  const usdcMint = getUsdcMint()
  const tokenMint = new PublicKey(tokenMintAddress)

  const account = await connection.getAccountInfo(
    new PublicKey(poolAddress),
    'finalized'
  )
  if (!account) {
    throw new Error(`Pool account ${poolAddress} not found`)
  }

  const cpmm = getCpmmProgramInfo(getClusterFromUrl(process.env.SOLANA_RPC_URL!))
  if (account.owner.toBase58() !== cpmm.programId.toBase58()) {
    throw new Error(`Pool ${poolAddress} is not a CPMM pool`)
  }

  const pool = CpmmPoolInfoLayout.decode(Buffer.from(account.data))
  const mintA = new PublicKey(pool.mintA)
  const mintB = new PublicKey(pool.mintB)
  const vaultA = new PublicKey(pool.vaultA)
  const vaultB = new PublicKey(pool.vaultB)

  const aIsUsdc = mintA.equals(usdcMint)
  const bIsUsdc = mintB.equals(usdcMint)
  if (!aIsUsdc && !bIsUsdc) {
    throw new Error(`Pool ${poolAddress} does not contain USDC`)
  }

  const [vaultAAccount, vaultBAccount] = await Promise.all([
    getAccount(connection, vaultA, 'finalized'),
    getAccount(connection, vaultB, 'finalized'),
  ])

  const reserveA = BigInt(vaultAAccount.amount)
  const reserveB = BigInt(vaultBAccount.amount)

  const usdcReserve = aIsUsdc ? reserveA : reserveB
  const tokenReserve = aIsUsdc ? reserveB : reserveA
  const usdcDecimals = aIsUsdc ? pool.mintDecimalA : pool.mintDecimalB
  const tokenDecimals = aIsUsdc ? pool.mintDecimalB : pool.mintDecimalA

  if (tokenReserve === BigInt(0)) {
    throw new Error(`Pool ${poolAddress} has no tokens in reserve`)
  }

  // Compare token mint in pool matches the startup mint so callers don't
  // accidentally compute a price for the wrong token.
  const actualTokenMint = aIsUsdc ? mintB : mintA
  if (!actualTokenMint.equals(tokenMint)) {
    throw new Error(
      `Pool ${poolAddress} token mint ${actualTokenMint.toBase58()} does not match expected ${tokenMintAddress}`
    )
  }

  const usdcAmount = new Decimal(usdcReserve, usdcDecimals)
  const tokenAmount = new Decimal(tokenReserve, tokenDecimals)
  // 18 decimal places is enough precision for the UI price display.
  return usdcAmount.div(tokenAmount, 18).toString()
}
