import {
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import fs from 'fs'

import { claimGraduationHolding } from '@/lib/graduation/claim'
import { mintGraduationToken } from '@/lib/graduation/mint'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { TokenAmount } from '@/lib/token-amount'
import { Decimal } from '@/lib/decimal'

const TOKEN_DECIMALS = 6

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) {
    try {
      ;(process as any).loadEnvFile?.(file)
    } catch {
      // ignore on older Node versions
    }
  }
}

const GRADUATION_ID =
  process.env.GRADUATION_ID ??
  '7abff8a6-f3e2-4d64-a286-3cd37c6bf185'

function ui(b: bigint): string {
  return new Decimal(b, TOKEN_DECIMALS).toFixed(TOKEN_DECIMALS)
}

function assertEq(actual: bigint, expected: bigint, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch: actual ${ui(actual)} (${actual.toString()}) !== expected ${ui(expected)} (${expected.toString()})`
    )
  }
}

function assertTrue(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${label}`)
  }
}

async function computeEscrowExpected(graduationId: string): Promise<{
  escrow_expected: string
  still_owed: string
  comparable: boolean
}> {
  const { data: grad, error: gradError } = await supabaseAdmin
    .from('graduations')
    .select('tokens_to_holders::text')
    .eq('id', graduationId)
    .single()

  if (gradError || !grad) {
    throw new Error(
      `Could not load graduation for escrow check: ${gradError?.message}`
    )
  }

  const { data: holders, error: hErr } = await supabaseAdmin
    .from('graduation_holders')
    .select('tokens_onchain::text, status')
    .eq('graduation_id', graduationId)

  if (hErr || !holders) {
    throw new Error(
      `Could not load holders for escrow check: ${hErr?.message}`
    )
  }

  const totalToHolders = TokenAmount.fromDatabase(
    grad.tokens_to_holders as string,
    TOKEN_DECIMALS
  ).toBaseUnit()

  let claimed = BigInt(0)
  let anyClaiming = false
  for (const h of holders) {
    const base = TokenAmount.fromDatabase(
      h.tokens_onchain as string,
      TOKEN_DECIMALS
    ).toBaseUnit()
    if (h.status === 'claimed') claimed += base
    if (h.status === 'claiming') anyClaiming = true
  }

  const remaining = totalToHolders - claimed
  const value = new Decimal(remaining, TOKEN_DECIMALS).toFixed(TOKEN_DECIMALS)

  return {
    escrow_expected: value,
    still_owed: value,
    comparable: !anyClaiming,
  }
}

async function loadEscrowExpected(graduationId: string): Promise<{
  escrow_expected: string
  still_owed: string
  comparable: boolean
  source: 'view' | 'computed'
}> {
  const { data: view, error: viewError } = await supabaseAdmin
    .from('graduation_escrow_expected')
    .select('escrow_expected::text, still_owed::text, comparable')
    .eq('graduation_id', graduationId)
    .single()

  const computed = await computeEscrowExpected(graduationId)

  if (view && !viewError) {
    const viewExpected = view.escrow_expected as string
    const viewStillOwed = view.still_owed as string
    const viewComparable = view.comparable as boolean

    const viewEscrowBase = TokenAmount.fromDatabase(
      viewExpected,
      TOKEN_DECIMALS
    ).toBaseUnit()
    const viewOwedBase = TokenAmount.fromDatabase(
      viewStillOwed,
      TOKEN_DECIMALS
    ).toBaseUnit()
    const computedEscrowBase = TokenAmount.fromDatabase(
      computed.escrow_expected,
      TOKEN_DECIMALS
    ).toBaseUnit()
    const computedOwedBase = TokenAmount.fromDatabase(
      computed.still_owed,
      TOKEN_DECIMALS
    ).toBaseUnit()

    if (
      viewEscrowBase !== computedEscrowBase ||
      viewOwedBase !== computedOwedBase ||
      viewComparable !== computed.comparable
    ) {
      throw new Error(
        `graduation_escrow_expected cross-check failed:\n` +
          `  view:    escrow_expected=${viewExpected} still_owed=${viewStillOwed} comparable=${viewComparable}\n` +
          `  computed: escrow_expected=${computed.escrow_expected} still_owed=${computed.still_owed} comparable=${computed.comparable}`
      )
    }

    return {
      escrow_expected: viewExpected,
      still_owed: viewStillOwed,
      comparable: viewComparable,
      source: 'view',
    }
  }

  if (!viewError?.message?.includes('permission denied')) {
    throw new Error(
      `Could not load graduation_escrow_expected: ${viewError?.message}`
    )
  }

  return { ...computed, source: 'computed' }
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY
  if (!rpcUrl || !privateKeyBase58) {
    throw new Error('Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY')
  }

  const connection = new Connection(rpcUrl, 'finalized')
  const platformKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
  const platformPubkey = platformKeypair.publicKey

  console.log('\n=== Step 1: mint ===')
  const mintResult = await mintGraduationToken(GRADUATION_ID)
  if (!mintResult.success) {
    throw new Error(`Mint halted: ${mintResult.reason}`)
  }
  const { mintAddress, escrowAddress } = mintResult
  console.log('Mint address:', mintAddress)
  console.log('Escrow address:', escrowAddress)

  const { data: grad, error: gradError } = await supabaseAdmin
    .from('graduations')
    .select(
      'total_supply::text, tokens_to_holders::text, tokens_to_lp::text, dust_to_lp::text, status'
    )
    .eq('id', GRADUATION_ID)
    .single()

  if (gradError || !grad) {
    throw new Error(`Could not load graduation row: ${gradError?.message}`)
  }

  const escrowView = await loadEscrowExpected(GRADUATION_ID)

  const expectedSupply = TokenAmount.fromDatabase(
    grad.total_supply as string,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const expectedEscrow = TokenAmount.fromDatabase(
    escrowView.escrow_expected as string,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const expectedStillOwed = TokenAmount.fromDatabase(
    escrowView.still_owed as string,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const expectedPlatform =
    TokenAmount.fromDatabase(
      grad.tokens_to_lp as string,
      TOKEN_DECIMALS
    ).toBaseUnit() +
    TokenAmount.fromDatabase(
      grad.dust_to_lp as string,
      TOKEN_DECIMALS
    ).toBaseUnit()

  const mintPubkey = new PublicKey(mintAddress)
  const escrowPubkey = new PublicKey(escrowAddress)
  const platformAta = getAssociatedTokenAddressSync(mintPubkey, platformPubkey)

  const mintInfo = await getMint(connection, mintPubkey, 'finalized')
  const escrowBal = await connection.getTokenAccountBalance(
    escrowPubkey,
    'finalized'
  )
  const platformBal = await connection.getTokenAccountBalance(
    platformAta,
    'finalized'
  )

  const supplyOnChain = mintInfo.supply
  const escrowOnChain = BigInt(escrowBal.value.amount)
  const platformOnChain = BigInt(platformBal.value.amount)

  console.log('Supply on chain:', ui(supplyOnChain))
  console.log('Escrow on chain:', ui(escrowOnChain))
  console.log('Platform on chain:', ui(platformOnChain))
  console.log('Freeze authority:', mintInfo.freezeAuthority?.toBase58() ?? 'null')
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58() ?? 'null')

  assertTrue(escrowView.comparable, 'escrow view must be comparable')
  assertEq(supplyOnChain, expectedSupply, 'Supply')
  assertEq(escrowOnChain, expectedEscrow, 'Escrow')
  assertEq(expectedEscrow, expectedStillOwed, 'Escrow expected must equal still owed')
  assertEq(platformOnChain, expectedPlatform, 'Platform')
  assertTrue(mintInfo.freezeAuthority === null, 'freeze authority must be null')
  assertTrue(
    mintInfo.mintAuthority !== null &&
      mintInfo.mintAuthority.equals(platformPubkey),
    'mint authority must be the platform wallet'
  )

  console.log('Step 1 passed.')

  console.log('\n=== Querying holders ===')
  const { data: holders, error: hErr } = await supabaseAdmin
    .from('graduation_holders')
    .select(
      'id, user_id, wallet_address, tokens_onchain::text, status, signature'
    )
    .eq('graduation_id', GRADUATION_ID)

  if (hErr || !holders) {
    throw new Error(`Could not load holders: ${hErr?.message}`)
  }

  const userIds = holders.map((h) => h.user_id)
  const { data: users, error: uErr } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .in('id', userIds)

  if (uErr || !users) {
    throw new Error(`Could not load users: ${uErr?.message}`)
  }

  const userMap = new Map(users.map((u) => [u.id, u]))
  const holdersByFixture = new Map<string, any>()

  for (const h of holders) {
    const u = userMap.get(h.user_id)
    let name = (u?.email ?? h.user_id)
      .split('@')[0]
      .replace(/\+/g, '_')
      .replace(/^\s+|\s+$/g, '')

    // User-facing names for the special cases
    if (name === 'fixture_h5' && h.status === 'dust_zero') {
      name = 'fixture_h5_dust'
    }
    if (name === 'fixture_h4') {
      name = 'fixture_h4_nowallet'
    }

    const fixture = name.startsWith('fixture_') ? name : null
    if (fixture) {
      holdersByFixture.set(fixture, h)
    }
    console.log('  holder:', fixture ?? name, h.id, h.status, h.tokens_onchain)
  }

  function getFixture(name: string) {
    const h = holdersByFixture.get(name)
    if (!h) throw new Error(`Missing fixture: ${name}`)
    return h
  }

  async function readRecipientBalance(walletAddress: string): Promise<bigint> {
    const recipientPubkey = new PublicKey(walletAddress)
    const recipientAta = getAssociatedTokenAddressSync(
      mintPubkey,
      recipientPubkey
    )
    try {
      const { value } = await connection.getTokenAccountBalance(
        recipientAta,
        'finalized'
      )
      return BigInt(value.amount)
    } catch (err: any) {
      throw new Error(`Could not read recipient token account balance: ${err.message}`)
    }
  }

  async function expectClaim(fixture: string, expectedSuccess: boolean) {
    const h = getFixture(fixture)
    const result = await claimGraduationHolding(h.id, h.user_id)
    const claimed = await supabaseAdmin
      .from('graduation_holders')
      .select('status, signature, error, wallet_address')
      .eq('id', h.id)
      .single()
    return { h, result, claimed: claimed.data as any }
  }

  console.log('\n=== Step 2: claim the rest ===')

  const h5 = await expectClaim('fixture_h5_dust', false)
  if (h5.result.success) {
    throw new Error(
      `fixture_h5_dust should have been refused but returned success`
    )
  }
  if (h5.result.status !== 400) {
    throw new Error(
      `fixture_h5_dust expected 400, got ${h5.result.status}: ${h5.result.error}`
    )
  }
  if (h5.claimed?.status !== 'dust_zero') {
    throw new Error(
      `fixture_h5_dust status changed unexpectedly: ${h5.claimed?.status}`
    )
  }
  console.log('fixture_h5_dust refused:', h5.result.error)

  const h4 = await expectClaim('fixture_h4_nowallet', true)
  if (!h4.result.success) {
    throw new Error(`fixture_h4_nowallet claim failed: ${h4.result.error}`)
  }
  if (h4.claimed?.status !== 'claimed' || !h4.claimed?.signature) {
    throw new Error(`fixture_h4_nowallet not marked claimed in DB`)
  }
  const h4Expected = TokenAmount.fromDatabase(
    h4.h.tokens_onchain,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const h4Wallet = h4.claimed?.wallet_address
  if (!h4Wallet) {
    throw new Error(`fixture_h4_nowallet wallet_address was not persisted`)
  }
  const h4Bal = await readRecipientBalance(h4Wallet)
  assertEq(h4Bal, h4Expected, 'fixture_h4_nowallet recipient balance')
  console.log(
    'fixture_h4_nowallet claimed:',
    h4.result.signature,
    'balance:',
    ui(h4Bal),
    'already_claimed:',
    h4.result.already_claimed
  )

  for (const fixture of ['fixture_h2', 'fixture_h3', 'fixture_h6']) {
    const { h, result, claimed } = await expectClaim(fixture, true)
    if (!result.success) {
      throw new Error(`${fixture} claim failed: ${result.error}`)
    }
    if (claimed?.status !== 'claimed' || !claimed?.signature) {
      throw new Error(`${fixture} not marked claimed in DB`)
    }
    const expected = TokenAmount.fromDatabase(
      h.tokens_onchain,
      TOKEN_DECIMALS
    ).toBaseUnit()
    const bal = await readRecipientBalance(h.wallet_address)
    assertEq(bal, expected, `${fixture} recipient balance`)
    console.log(`${fixture} claimed:`, result.signature, 'balance:', ui(bal))
  }

  console.log('\n=== Step 3: escrow balance after claims ===')
  const escrowAfter = await connection.getTokenAccountBalance(
    escrowPubkey,
    'finalized'
  )
  const escrowAfterBase = BigInt(escrowAfter.value.amount)

  const escrowViewAfter = await loadEscrowExpected(GRADUATION_ID)

  const expectedEscrowAfter = TokenAmount.fromDatabase(
    escrowViewAfter.escrow_expected as string,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const expectedStillOwedAfter = TokenAmount.fromDatabase(
    escrowViewAfter.still_owed as string,
    TOKEN_DECIMALS
  ).toBaseUnit()
  console.log('Escrow on chain after:', ui(escrowAfterBase))
  console.log('Expected escrow after:', ui(expectedEscrowAfter))
  console.log('Still owed after:', ui(expectedStillOwedAfter))
  assertTrue(
    escrowViewAfter.comparable,
    'escrow view after claims must be comparable'
  )
  assertEq(escrowAfterBase, expectedEscrowAfter, 'Escrow after claims')
  assertEq(
    expectedEscrowAfter,
    expectedStillOwedAfter,
    'Escrow after claims must equal still owed'
  )
  assertEq(
    expectedStillOwedAfter,
    BigInt(0),
    'Still owed after all claims must be 0'
  )
  assertEq(escrowAfterBase, BigInt(0), 'Escrow on chain must be 0')

  console.log('\n=== Step 4: re-claim fixture_h1 ===')
  const escrowBeforeRetry = await connection.getTokenAccountBalance(
    escrowPubkey,
    'finalized'
  )
  const escrowBeforeRetryBase = BigInt(escrowBeforeRetry.value.amount)

  const h1Retry = await expectClaim('fixture_h1', false)

  const escrowAfterRetry = await connection.getTokenAccountBalance(
    escrowPubkey,
    'finalized'
  )
  const escrowAfterRetryBase = BigInt(escrowAfterRetry.value.amount)

  console.log('Escrow before retry:', ui(escrowBeforeRetryBase))
  console.log('Escrow after retry:', ui(escrowAfterRetryBase))

  if (!h1Retry.result.success) {
    throw new Error(
      `fixture_h1 double-claim unexpectedly failed: ${h1Retry.result.error}`
    )
  }

  if (!h1Retry.result.already_claimed) {
    const sig = h1Retry.result.signature ?? 'n/a'
    throw new Error(
      `fixture_h1 double-claim did not report already_claimed (signature ${sig})`
    )
  }

  if (escrowBeforeRetryBase !== escrowAfterRetryBase) {
    throw new Error(
      `Double-claim changed escrow balance: ${escrowBeforeRetryBase} -> ${escrowAfterRetryBase}`
    )
  }

  console.log('fixture_h1 double-claim already_claimed:', h1Retry.result.already_claimed)
  console.log('fixture_h1 double-claim signature:', h1Retry.result.signature)
  console.log('All steps passed.')
}

main().catch((err) => {
  console.error('\nSENTINEL RUN FAILED:', err)
  process.exit(1)
})
