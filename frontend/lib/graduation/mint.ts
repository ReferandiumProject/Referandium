import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METAPLEX_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata'
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

import { supabaseAdmin } from '@/lib/supabaseServer'
import { TokenAmount } from '@/lib/token-amount'
import { transition, halt as stateHalt } from './state'
import { notifyTokensClaimable } from '@/lib/notifications'

const TOKEN_DECIMALS = 6
const METADATA_NAME_MAX = 32
const METADATA_SYMBOL_MAX = 10

export interface MintDeps {
  supabase?: typeof supabaseAdmin
  connection?: Connection
  platformKeypair?: Keypair
}

export interface GraduationRow {
  id: string
  startup_id: string
  status: string
  mint_address: string | null
  escrow_address: string | null
  token_name: string | null
  token_symbol: string | null
  total_supply: string
  tokens_to_holders: string
  tokens_to_lp: string
  dust_to_lp: string
}

export type MintResult =
  | {
      success: true
      mintAddress: string
      escrowAddress: string
      signatures: {
        mint: string
        metadata: string
        escrowFund: string
      }
    }
  | { success: false; halted: true; reason: string }

async function halt(
  supabase: typeof supabaseAdmin,
  graduationId: string,
  from: string,
  reason: string
): Promise<MintResult> {
  await stateHalt(supabase, graduationId, from, reason)
  return { success: false, halted: true, reason }
}

function assertEnv(): { connection: Connection; platformKeypair: Keypair } {
  const rpcUrl = process.env.SOLANA_RPC_URL
  const privateKeyBase58 = process.env.PLATFORM_WALLET_PRIVATE_KEY

  if (!rpcUrl || !privateKeyBase58) {
    throw new Error(
      'Missing SOLANA_RPC_URL or PLATFORM_WALLET_PRIVATE_KEY env vars'
    )
  }

  return {
    connection: new Connection(rpcUrl, 'finalized'),
    platformKeypair: Keypair.fromSecretKey(bs58.decode(privateKeyBase58)),
  }
}

function normalizeLogoUrl(logoUrl: string): string {
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return logoUrl
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  const clean = logoUrl.replace(/^\//, '')
  return `${base}/storage/v1/object/public/images/${clean}`
}

export async function mintGraduationToken(
  graduationId: string,
  deps: MintDeps = {}
): Promise<MintResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const { connection, platformKeypair } =
    deps.connection && deps.platformKeypair
      ? { connection: deps.connection, platformKeypair: deps.platformKeypair }
      : assertEnv()
  const platformPubkey = platformKeypair.publicKey

  const { data: raw, error: gradError } = await supabase
    .from('graduations')
    .select(
      'id, startup_id, status, mint_address, escrow_address, token_name, token_symbol, total_supply::text, tokens_to_holders::text, tokens_to_lp::text, dust_to_lp::text'
    )
    .eq('id', graduationId)
    .single()

  if (gradError || !raw) {
    return halt(
      supabase,
      graduationId,
      'unknown',
      gradError?.message ?? 'Graduation not found'
    )
  }

  const graduation = raw as unknown as GraduationRow

  if (graduation.status === 'minted') {
    if (!graduation.mint_address || !graduation.escrow_address) {
      return halt(
        supabase,
        graduationId,
        graduation.status,
        'Minted row is missing mint_address or escrow_address'
      )
    }
    return {
      success: true,
      mintAddress: graduation.mint_address,
      escrowAddress: graduation.escrow_address,
      signatures: {
        mint: '',
        metadata: '',
        escrowFund: '',
      },
    }
  }

  if (
    graduation.status !== 'snapshotted' &&
    graduation.status !== 'minting'
  ) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `Cannot mint from status ${graduation.status}`
    )
  }

  const expectedSupply = TokenAmount.fromDatabase(
    graduation.total_supply,
    TOKEN_DECIMALS
  ).toBaseUnit()

  if (graduation.mint_address) {
    let mintInfo
    try {
      mintInfo = await getMint(
        connection,
        new PublicKey(graduation.mint_address),
        'finalized'
      )
    } catch (err: any) {
      return halt(
        supabase,
        graduationId,
        graduation.status,
        `Resume: could not read on-chain mint: ${err.message}`
      )
    }

    const mintOk =
      mintInfo.decimals === TOKEN_DECIMALS &&
      mintInfo.mintAuthority !== null &&
      mintInfo.mintAuthority.equals(platformPubkey) &&
      mintInfo.freezeAuthority === null &&
      mintInfo.supply === expectedSupply

    if (!mintOk) {
      return halt(
        supabase,
        graduationId,
        graduation.status,
        `Resume: existing mint ${graduation.mint_address} does not match expected state (decimals, supply, authorities)`
      )
    }

    if (graduation.escrow_address) {
      let escrowBalance
      try {
        const { value } = await connection.getTokenAccountBalance(
          new PublicKey(graduation.escrow_address),
          'finalized'
        )
        escrowBalance = BigInt(value.amount)
      } catch (err: any) {
        return halt(
          supabase,
          graduationId,
          graduation.status,
          `Resume: could not read escrow balance: ${err.message}`
        )
      }

      const expectedEscrow = TokenAmount.fromDatabase(
        graduation.tokens_to_holders,
        TOKEN_DECIMALS
      ).toBaseUnit()

      if (escrowBalance !== expectedEscrow) {
        return halt(
          supabase,
          graduationId,
          graduation.status,
          `Resume: existing escrow balance ${escrowBalance} does not match expected ${expectedEscrow}`
        )
      }
    } else {
      return halt(
        supabase,
        graduationId,
        graduation.status,
        'Resume: mint exists but escrow_address is missing; tokens may already be somewhere else'
      )
    }

    await transition(
      supabase,
      graduationId,
      graduation.status,
      'minted',
      {},
      'Resumed from existing on-chain mint and escrow'
    )
    return {
      success: true,
      mintAddress: graduation.mint_address,
      escrowAddress: graduation.escrow_address,
      signatures: { mint: '', metadata: '', escrowFund: '' },
    }
  }

  if (!graduation.token_name || !graduation.token_symbol) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      'Missing token_name or token_symbol'
    )
  }

  if (graduation.token_name.length > METADATA_NAME_MAX) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `token_name exceeds ${METADATA_NAME_MAX} characters`
    )
  }

  if (graduation.token_symbol.length > METADATA_SYMBOL_MAX) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `token_symbol exceeds ${METADATA_SYMBOL_MAX} characters`
    )
  }

  const toHolders = TokenAmount.fromDatabase(
    graduation.tokens_to_holders,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const toLp = TokenAmount.fromDatabase(
    graduation.tokens_to_lp,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const dustToLp = TokenAmount.fromDatabase(
    graduation.dust_to_lp,
    TOKEN_DECIMALS
  ).toBaseUnit()
  const toPlatform = toLp + dustToLp

  if (toHolders + toPlatform !== expectedSupply) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `Token allocations do not sum to total supply: ${toHolders} + ${toPlatform} != ${expectedSupply}`
    )
  }

  const { data: startup, error: startupError } = await supabase
    .from('startup_startups')
    .select('logo_url')
    .eq('id', graduation.startup_id)
    .single()

  if (startupError || !startup) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `Missing startup: ${startupError?.message ?? 'not found'}`
    )
  }

  let imageUrl: string | undefined
  if (startup.logo_url) {
    try {
      imageUrl = normalizeLogoUrl(startup.logo_url as string)
    } catch (err: any) {
      return halt(supabase, graduationId, graduation.status, err.message)
    }
  }

  const metadata: Record<string, unknown> = {
    name: graduation.token_name,
    symbol: graduation.token_symbol,
  }
  if (imageUrl) {
    metadata.image = imageUrl
  }

  const metadataJson = JSON.stringify(metadata)

  const metadataPath = `graduations/${graduationId}/metadata.json`
  const { error: uploadError } = await supabase.storage
    .from('token-metadata')
    .upload(metadataPath, Buffer.from(metadataJson), {
      contentType: 'application/json',
      upsert: true,
    })

  if (uploadError) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `Metadata upload failed: ${uploadError.message}`
    )
  }

  const { data: publicUrl } = supabase.storage
    .from('token-metadata')
    .getPublicUrl(metadataPath)
  const metadataUri = publicUrl.publicUrl

  try {
    const head = await fetch(metadataUri, { method: 'HEAD' })
    if (!head.ok) {
      throw new Error(`HEAD ${metadataUri} returned ${head.status}`)
    }
    // Cancel the body so the socket is released even though HEAD has none.
    await head.body?.cancel()
  } catch (err: any) {
    return halt(
      supabase,
      graduationId,
      graduation.status,
      `Metadata URL is not public/reachable: ${err.message}`
    )
  }

  await transition(
    supabase,
    graduationId,
    graduation.status,
    'minting',
    {},
    `Starting mint. Platform: ${platformPubkey.toBase58()}`
  )

  const mintKeypair = Keypair.generate()
  const mintPubkey = mintKeypair.publicKey

  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    MINT_SIZE
  )
  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: platformPubkey,
      newAccountPubkey: mintPubkey,
      space: MINT_SIZE,
      lamports: mintLamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintPubkey,
      TOKEN_DECIMALS,
      platformPubkey,
      null,
      TOKEN_PROGRAM_ID
    )
  )
  createMintTx.feePayer = platformPubkey

  let mintSignature: string
  try {
    mintSignature = await sendAndConfirmTransaction(
      connection,
      createMintTx,
      [platformKeypair, mintKeypair],
      { commitment: 'finalized' }
    )
  } catch (err: any) {
    return halt(
      supabase,
      graduationId,
      'minting',
      `Mint creation failed: ${err.message}`
    )
  }

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METAPLEX_METADATA_PROGRAM_ID.toBuffer(),
      mintPubkey.toBuffer(),
    ],
    METAPLEX_METADATA_PROGRAM_ID
  )

  const metadataData = {
    name: graduation.token_name,
    symbol: graduation.token_symbol,
    uri: metadataUri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  }

  const createMetadataIx = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPda,
      mint: mintPubkey,
      mintAuthority: platformPubkey,
      payer: platformPubkey,
      updateAuthority: platformPubkey,
    },
    {
      createMetadataAccountArgsV3: {
        data: metadataData as any,
        isMutable: false,
        collectionDetails: null,
      },
    }
  )

  const metadataTx = new Transaction().add(createMetadataIx)
  metadataTx.feePayer = platformPubkey

  let metadataSignature: string
  try {
    metadataSignature = await sendAndConfirmTransaction(
      connection,
      metadataTx,
      [platformKeypair],
      { commitment: 'finalized' }
    )
  } catch (err: any) {
    return halt(
      supabase,
      graduationId,
      'minting',
      `Metadata creation failed: ${err.message}`
    )
  }

  const escrowKeypair = Keypair.generate()
  const escrowPubkey = escrowKeypair.publicKey

  const escrowLamports = await connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE
  )
  const platformAta = getAssociatedTokenAddressSync(mintPubkey, platformPubkey)

  const fundTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: platformPubkey,
      newAccountPubkey: escrowPubkey,
      space: ACCOUNT_SIZE,
      lamports: escrowLamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      escrowPubkey,
      mintPubkey,
      platformPubkey,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      platformPubkey,
      platformAta,
      platformPubkey,
      mintPubkey,
      TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mintPubkey,
      escrowPubkey,
      platformPubkey,
      toHolders,
      [],
      TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mintPubkey,
      platformAta,
      platformPubkey,
      toPlatform,
      [],
      TOKEN_PROGRAM_ID
    )
  )
  fundTx.feePayer = platformPubkey

  let escrowFundSignature: string
  try {
    escrowFundSignature = await sendAndConfirmTransaction(
      connection,
      fundTx,
      [platformKeypair, escrowKeypair],
      { commitment: 'finalized' }
    )
  } catch (err: any) {
    return halt(
      supabase,
      graduationId,
      'minting',
      `Escrow creation and token minting failed: ${err.message}`
    )
  }

  try {
    const finalMint = await getMint(connection, mintPubkey, 'finalized')
    if (finalMint.supply !== expectedSupply) {
      throw new Error(
        `Mint supply mismatch: got ${finalMint.supply}, expected ${expectedSupply}`
      )
    }
    if (finalMint.freezeAuthority !== null) {
      throw new Error('Freeze authority is not null after mint')
    }
    if (
      finalMint.mintAuthority === null ||
      !finalMint.mintAuthority.equals(platformPubkey)
    ) {
      throw new Error('Mint authority does not match platform wallet')
    }

    const { value } = await connection.getTokenAccountBalance(
      escrowPubkey,
      'finalized'
    )
    if (BigInt(value.amount) !== toHolders) {
      throw new Error(
        `Escrow balance mismatch: got ${value.amount}, expected ${toHolders}`
      )
    }
  } catch (err: any) {
    return halt(
      supabase,
      graduationId,
      'minting',
      `On-chain verification failed: ${err.message}`
    )
  }

  await transition(
    supabase,
    graduationId,
    'minting',
    'minted',
    {
      mint_address: mintPubkey.toBase58(),
      mint_signature: mintSignature,
      metadata_signature: metadataSignature,
      escrow_address: escrowPubkey.toBase58(),
      escrow_fund_signature: escrowFundSignature,
    },
    `Minted. Mint ${mintPubkey.toBase58()}, escrow ${escrowPubkey.toBase58()}`
  )

  const { data: mintedHolders } = await supabase
    .from('graduation_holders')
    .select('id')
    .eq('graduation_id', graduationId)
    .in('status', ['minted', 'pooling', 'pooled', 'burning', 'burned', 'paying_founder', 'founder_paid', 'revoking', 'complete'])

  for (const holder of mintedHolders ?? []) {
    void notifyTokensClaimable((holder as any).id, graduationId)
  }

  return {
    success: true,
    mintAddress: mintPubkey.toBase58(),
    escrowAddress: escrowPubkey.toBase58(),
    signatures: {
      mint: mintSignature,
      metadata: metadataSignature,
      escrowFund: escrowFundSignature,
    },
  }
}
