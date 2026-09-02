import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import bs58 from 'bs58'

import { supabaseAdmin } from '@/lib/supabaseServer'
import { TokenAmount } from '@/lib/token-amount'
import { Decimal } from '@/lib/decimal'
import { recordSystemError } from '@/lib/system-errors'

const USDC_DECIMALS = 6

// Conservative on-chain SOL reserve. The exact cost of pool creation, LP burn,
// founder transfer, authority revocation and token-account rent is hard to pin
// down until the launch transaction is built, so this headroom is intentionally
// generous. It can be increased via PREFLIGHT_SOL_EXTRA_LAMPORTS.
const SOL_HEADROOM_SOL = 0.05

export interface PreflightDeps {
  supabase?: typeof supabaseAdmin
  connection?: Connection
  platformKeypair?: Keypair
}

export interface PreflightResult {
  graduationId: string
  passed: boolean
  reason?: string
  figures: {
    founderWallet: string | null
    founderUsdc: string
    liquidityUsdc: string
    requiredUsdc: string
    treasuryUsdc: string
    requiredSolLamports: bigint
    treasurySolLamports: bigint
    usdcAta: string
  }
}

function assertEnv(): { connection: Connection; platformKeypair: Keypair } {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY
  const usdcMint = process.env.USDC_MINT_ADDRESS

  if (!rpcUrl || !privateKeyBase58 || !usdcMint) {
    throw new Error(
      'Missing SOLANA_RPC_URL, PLATFORM_WALLET_PRIVATE_KEY, or USDC_MINT_ADDRESS env vars'
    )
  }

  return {
    connection: new Connection(rpcUrl, 'finalized'),
    platformKeypair: Keypair.fromSecretKey(bs58.decode(privateKeyBase58)),
  }
}

async function halt(supabase: typeof supabaseAdmin, graduationId: string, from: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('graduations')
    .update({
      status: 'halted',
      halted_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', graduationId)

  if (error) {
    console.error('[graduation/preflight] halt update failed:', error)
    void recordSystemError({
      source: 'swallowed',
      name: 'PreflightHaltUpdateFailed',
      message: error.message,
      path: 'lib/graduation/preflight.ts/halt',
      context: { graduationId, from, reason, error: { message: error.message, code: error.code } },
    })
  }

  const { error: eventError } = await supabase.from('graduation_events').insert({
    graduation_id: graduationId,
    from_status: from,
    to_status: 'halted',
    note: reason,
    actor: 'platform',
  })

  if (eventError) {
    console.error('[graduation/preflight] graduation_events insert failed:', eventError)
    void recordSystemError({
      source: 'swallowed',
      name: 'PreflightHaltEventInsertFailed',
      message: eventError.message,
      path: 'lib/graduation/preflight.ts/halt',
      context: { graduationId, from, reason, eventError: { message: eventError.message, code: eventError.code } },
    })
  }
}

export async function preflightGraduationLaunch(
  graduationId: string,
  deps: PreflightDeps = {}
): Promise<PreflightResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()
  const platformPubkey = platformKeypair.publicKey

  const { data: grad, error: gradError } = await supabase
    .from('graduations')
    .select(
      'founder_usdc::text, liquidity_usdc::text, founder_wallet_address, status'
    )
    .eq('id', graduationId)
    .single()

  if (gradError || !grad) {
    throw new Error(`Could not load graduation: ${gradError?.message ?? 'not found'}`)
  }

  const founderUsdc = TokenAmount.fromDatabase(grad.founder_usdc as string, USDC_DECIMALS)
  const liquidityUsdc = TokenAmount.fromDatabase(grad.liquidity_usdc as string, USDC_DECIMALS)
  const baseUsdc = founderUsdc.toBaseUnit() + liquidityUsdc.toBaseUnit()

  // Optional overrides for testing or headroom.
  const usdcExtraUi = Number(process.env.PREFLIGHT_USDC_EXTRA || '0')
  const solExtraLamports = BigInt(process.env.PREFLIGHT_SOL_EXTRA_LAMPORTS || '0')
  const usdcExtra = usdcExtraUi > 0
    ? TokenAmount.fromDatabase(usdcExtraUi.toString(), USDC_DECIMALS).toBaseUnit()
    : undefined

  const requiredUsdcBase = baseUsdc + (usdcExtra ?? BigInt(0))

  const baseSolHeadroom = BigInt(Math.floor(SOL_HEADROOM_SOL * LAMPORTS_PER_SOL))
  const requiredSolLamports = baseSolHeadroom + solExtraLamports

  const usdcMintPubkey = new PublicKey(process.env.USDC_MINT_ADDRESS!)
  const treasuryUsdcAta = getAssociatedTokenAddressSync(usdcMintPubkey, platformPubkey)

  const [solBalance, usdcBalance] = await Promise.all([
    connection.getBalance(platformPubkey),
    (async () => {
      try {
        const { value } = await connection.getTokenAccountBalance(treasuryUsdcAta, 'finalized')
        return BigInt(value.amount)
      } catch (err: any) {
        if (err.message?.includes('could not find account') || err.code === -32602) {
          return BigInt(0)
        }
        throw new Error(`Could not read treasury USDC balance: ${err.message}`)
      }
    })(),
  ])

  const founderWalletAddress = grad.founder_wallet_address as string | null
  let walletOk = false
  let walletReason = ''
  if (!founderWalletAddress || founderWalletAddress.trim() === '') {
    walletReason = 'Founder wallet address is missing on the graduation row'
  } else {
    try {
      new PublicKey(founderWalletAddress)
      walletOk = true
    } catch {
      walletReason = `Founder wallet address is not a valid Solana public key: ${founderWalletAddress}`
    }
  }

  const fromStatus = (grad.status as string) ?? 'unknown'
  const figures = {
    founderWallet: founderWalletAddress,
    founderUsdc: new Decimal(founderUsdc.toBaseUnit(), USDC_DECIMALS).toString(),
    liquidityUsdc: new Decimal(liquidityUsdc.toBaseUnit(), USDC_DECIMALS).toString(),
    requiredUsdc: new Decimal(requiredUsdcBase, USDC_DECIMALS).toString() + (usdcExtra ? ` (includes ${new Decimal(usdcExtra, USDC_DECIMALS).toString()} extra)` : ''),
    treasuryUsdc: new Decimal(usdcBalance, USDC_DECIMALS).toString(),
    requiredSolLamports,
    treasurySolLamports: BigInt(solBalance),
    usdcAta: treasuryUsdcAta.toBase58(),
  }

  console.log('=== Graduation launch preflight ===')
  console.log('Graduation ID:', graduationId)
  console.log('Current status:', fromStatus)
  console.log('Founder wallet:', founderWalletAddress ?? '<missing>')
  console.log('Founder USDC required:', figures.founderUsdc)
  console.log('Liquidity USDC required:', figures.liquidityUsdc)
  if (usdcExtra) {
    console.log('Extra USDC headroom (PREFLIGHT_USDC_EXTRA):', new Decimal(usdcExtra, USDC_DECIMALS).toString())
  }
  console.log('Total USDC required:', figures.requiredUsdc)
  console.log('Treasury USDC ATA:', figures.usdcAta)
  console.log('Treasury USDC balance:', figures.treasuryUsdc)
  console.log('SOL headroom assumption:', `${SOL_HEADROOM_SOL} SOL`)
  if (solExtraLamports > BigInt(0)) {
    console.log('Extra SOL lamports (PREFLIGHT_SOL_EXTRA_LAMPORTS):', solExtraLamports.toString())
  }
  console.log('SOL required (lamports):', figures.requiredSolLamports.toString())
  console.log('Treasury SOL balance (lamports):', figures.treasurySolLamports.toString())

  let reason: string | undefined

  if (!walletOk) {
    reason = walletReason
  } else if (usdcBalance < requiredUsdcBase) {
    const available = new Decimal(usdcBalance, USDC_DECIMALS).toString()
    const required = new Decimal(requiredUsdcBase, USDC_DECIMALS).toString()
    reason = `Insufficient treasury USDC: available ${available}, required ${required}`
  } else if (BigInt(solBalance) < requiredSolLamports) {
    reason = `Insufficient treasury SOL: available ${solBalance} lamports, required ${requiredSolLamports} lamports`
  }

  if (reason) {
    console.log('Result: HALT')
    console.log('Reason:', reason)
    await halt(supabase, graduationId, fromStatus, reason)
    return { graduationId, passed: false, reason, figures }
  }

  console.log('Result: PASS')
  return { graduationId, passed: true, figures }
}
