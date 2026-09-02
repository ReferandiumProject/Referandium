import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { Decimal } from '@/lib/decimal'
import { TokenAmount } from '@/lib/token-amount'

const USDC_DECIMALS = 6
const TOKEN_DECIMALS = 6

async function main() {
  const { supabaseAdmin } = await import('@/lib/supabaseServer')

  const rpcUrl = process.env.SOLANA_RPC_URL
  const usdcMint = process.env.USDC_MINT_ADDRESS
  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
  if (!rpcUrl || !usdcMint || !platformAddress) {
    throw new Error('Missing SOLANA_RPC_URL, USDC_MINT_ADDRESS, or PLATFORM_SOLANA_ADDRESS')
  }

  const connection = new Connection(rpcUrl, 'finalized')
  const usdcMintPubkey = new PublicKey(usdcMint)
  const platformPubkey = new PublicKey(platformAddress)
  const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMintPubkey, platformPubkey)

  // -------------------------------------------------------------------
  // 1 & 2: Per-graduation checks
  // -------------------------------------------------------------------
  const { data: graduations, error: gradError } = await supabaseAdmin
    .from('graduations')
    .select(
      'id, status, startup_id, mint_address, escrow_address, ' +
      'total_supply::text, tokens_to_holders::text, tokens_to_lp::text, dust_to_lp::text, ' +
      'founder_usdc::text, liquidity_usdc::text'
    )
    .order('created_at', { ascending: false })

  if (gradError || !graduations) {
    throw new Error(`Could not load graduations: ${gradError?.message ?? 'unknown'}`)
  }

  const gradRows = graduations as any[]

  const startupIds = gradRows
    .map((g) => g.startup_id as string | null)
    .filter((id): id is string => !!id)

  const { data: curves, error: curveError } = await supabaseAdmin
    .from('startup_curve_state')
    .select('startup_id, pool_usdc::text')
    .in('startup_id', startupIds)

  if (curveError) throw new Error(`Could not load startup_curve_state: ${curveError.message}`)

  const poolByStartup = new Map<string, string>()
  for (const c of curves ?? []) {
    if (c.startup_id && c.pool_usdc) poolByStartup.set(c.startup_id as string, c.pool_usdc as string)
  }

  const errors: string[] = []
  const skipReasons: string[] = []

  for (const g of gradRows) {
    console.log(`\n--- graduation ${g.id} (${g.status}) ---`)

    const tokenFields = [g.total_supply, g.tokens_to_holders, g.tokens_to_lp, g.dust_to_lp]
    if (tokenFields.every((v) => v != null)) {
      const totalSupply = Decimal.parse(g.total_supply as string)
      const toHolders = Decimal.parse(g.tokens_to_holders as string)
      const toLp = Decimal.parse(g.tokens_to_lp as string)
      const dust = Decimal.parse(g.dust_to_lp as string)
      const tokenSum = toHolders.add(toLp).add(dust)

      console.log('total_supply:', totalSupply.toString())
      console.log('tokens_to_holders:', toHolders.toString())
      console.log('tokens_to_lp:', toLp.toString())
      console.log('dust_to_lp:', dust.toString())
      console.log('sum of parts:', tokenSum.toString())

      if (tokenSum.toString() !== totalSupply.toString()) {
        errors.push(
          `Token supply mismatch for graduation ${g.id}: ` +
            `tokens_to_holders + tokens_to_lp + dust_to_lp = ${tokenSum.toString()} ` +
            `!= total_supply ${totalSupply.toString()}`
        )
      }
    } else {
      console.log('Skipping token supply arithmetic: one or more fields are null')
    }

    const poolUsdcText = g.pool_usdc ?? poolByStartup.get(g.startup_id as string)
    const usdcFields = [g.founder_usdc, g.liquidity_usdc, poolUsdcText]
    if (usdcFields.every((v) => v != null)) {
      const founderUsdc = Decimal.parse(g.founder_usdc as string)
      const liquidityUsdc = Decimal.parse(g.liquidity_usdc as string)
      const poolUsdc = Decimal.parse(poolUsdcText as string)
      const sum = founderUsdc.add(liquidityUsdc)

      console.log('founder_usdc:', founderUsdc.toString())
      console.log('liquidity_usdc:', liquidityUsdc.toString())
      console.log('pool_usdc:', poolUsdc.toString())
      console.log('founder + liquidity:', sum.toString())

      if (sum.toString() !== poolUsdc.toString()) {
        errors.push(
          `USDC arithmetic mismatch for graduation ${g.id}: ` +
            `founder_usdc + liquidity_usdc = ${sum.toString()} ` +
            `!= pool_usdc ${poolUsdc.toString()}`
        )
      }
    } else {
      console.log('Skipping USDC arithmetic: one of founder/liquidity/pool_usdc is null')
    }

    // --- Escrow check ---
    if (!g.mint_address || !g.escrow_address) {
      console.log('Skipping escrow: mint or escrow address missing')
      continue
    }

    const { data: escrowView, error: escrowError } = await supabaseAdmin
      .from('graduation_escrow_expected')
      .select('escrow_expected::text, still_owed::text, comparable')
      .eq('graduation_id', g.id as string)
      .single()

    if (escrowError || !escrowView) {
      errors.push(`Could not load graduation_escrow_expected for ${g.id}: ${escrowError?.message}`)
      continue
    }

    const expected = TokenAmount.fromDatabase(escrowView.escrow_expected as string, TOKEN_DECIMALS).toBaseUnit()
    const stillOwed = TokenAmount.fromDatabase(escrowView.still_owed as string, TOKEN_DECIMALS).toBaseUnit()
    const comparable = escrowView.comparable as boolean

    console.log('escrow_expected:', ui(expected, TOKEN_DECIMALS))
    console.log('still_owed:', ui(stillOwed, TOKEN_DECIMALS))
    console.log('comparable:', comparable)

    if (!comparable) {
      const reason = `Skipping escrow on-chain check for graduation ${g.id}: a holder is in claiming state`
      console.log(reason)
      skipReasons.push(reason)
      continue
    }

    if (expected !== stillOwed) {
      errors.push(
        `Escrow expected vs still_owed mismatch for graduation ${g.id}: ` +
          `escrow_expected ${ui(expected, TOKEN_DECIMALS)} != still_owed ${ui(stillOwed, TOKEN_DECIMALS)}`
      )
      continue
    }

    const escrowPubkey = new PublicKey(g.escrow_address as string)
    const onChain = BigInt(
      (await connection.getTokenAccountBalance(escrowPubkey, 'finalized')).value.amount
    )

    console.log('escrow on-chain:', ui(onChain, TOKEN_DECIMALS))

    if (onChain !== expected) {
      errors.push(
        `Escrow balance mismatch for graduation ${g.id}: ` +
          `on-chain ${ui(onChain, TOKEN_DECIMALS)} != expected ${ui(expected, TOKEN_DECIMALS)}`
      )
    }
  }

  // -------------------------------------------------------------------
  // 3: Treasury vs ledger — report only
  // -------------------------------------------------------------------
  console.log('\n=== Treasury vs ledger ===')

  const { value } = await connection.getTokenAccountBalance(treasuryUsdcAta, 'finalized')
  const treasuryUsdcBase = BigInt(value.amount)
  const treasuryUsdc = new Decimal(treasuryUsdcBase, USDC_DECIMALS)

  const { data: liability, error: liabilityError } = await supabaseAdmin
    .from('ledger_liability')
    .select('backed_liability_exact')
    .single()

  if (liabilityError) throw new Error(`Could not load ledger liability: ${liabilityError.message}`)

  const backedLiability = Decimal.parse((liability?.backed_liability_exact as string | null) ?? '0')
  const difference = treasuryUsdc.sub(backedLiability)

  console.log('treasury USDC on-chain:', treasuryUsdc.toString())
  console.log('backed_liability_exact:', backedLiability.toString())
  console.log('difference:', difference.toString())
  console.log()
  console.log(
    'Note: this difference is not an alarm on devnet. ' +
      'The test suite shares this database, the treasury was hand-funded, and the fiat leg ' +
      'has never been converted to on-chain USDC — 74.83 came in through Stripe and sits in Stripe. ' +
      'backed_liability was also written off to zero by declaration on 2026-08-29, so it is a ' +
      'baseline rather than a measurement.'
  )

  // -------------------------------------------------------------------
  // 4: Unknown withdrawals for review
  // -------------------------------------------------------------------
  console.log('\n=== Unknown withdrawals ===')
  const { data: unknownWithdrawals, error: unknownError } = await supabaseAdmin
    .from('withdrawals')
    .select('id, user_id, amount_usdc::text, signature, status, created_at')
    .eq('status', 'unknown')
    .order('created_at', { ascending: false })

  if (unknownError) throw new Error(`Could not load unknown withdrawals: ${unknownError.message}`)

  if ((unknownWithdrawals ?? []).length === 0) {
    console.log('No withdrawals in unknown status.')
  } else {
    for (const w of unknownWithdrawals as any[]) {
      console.log(
        `  ${w.id} user=${w.user_id} amount=${w.amount_usdc} signature=${w.signature ?? 'null'} created_at=${w.created_at}`
      )
    }
  }

  for (const skip of skipReasons) {
    console.log(`\n${skip}`)
  }

  if (errors.length > 0) {
    for (const err of errors) {
      console.error(`\nRECONCILE FAILED: ${err}`)
    }
    process.exit(1)
  }

  console.log('\nAll exact checks passed.')
}

function ui(base: bigint, decimals: number): string {
  return new Decimal(base, decimals).toString()
}

main().catch((err) => {
  console.error('RECONCILE FAILED:', err)
  process.exit(1)
})
