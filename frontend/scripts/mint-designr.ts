import { getAssociatedTokenAddressSync, getMint } from '@solana/spl-token'
import { Connection, PublicKey } from '@solana/web3.js'

import { mintGraduationToken } from '@/lib/graduation/mint'
import { supabaseAdmin } from '@/lib/supabaseServer'

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL is not set')
  }

  const graduationId = process.env.GRADUATION_ID
  if (!graduationId) {
    throw new Error('GRADUATION_ID is not set')
  }

  console.log('Looking up graduation:', graduationId)
  const { data: graduation, error: gradError } = await supabaseAdmin
    .from('graduations')
    .select(
      'id, status, startup_id, mint_address, escrow_address, token_name, token_symbol, total_supply, tokens_to_holders, tokens_to_lp, dust_to_lp'
    )
    .eq('id', graduationId)
    .single()

  if (gradError || !graduation) {
    throw new Error(`Graduation not found: ${gradError?.message}`)
  }

  console.log('Graduation row:', graduation.id, graduation.status)

  const result = await mintGraduationToken(graduation.id as string)
  if (!result.success) {
    console.error('Minting halted:', result.reason)
    process.exit(1)
  }

  console.log('Mint result:', result)

  const connection = new Connection(rpcUrl, 'finalized')
  const mintInfo = await getMint(
    connection,
    new PublicKey(result.mintAddress),
    'finalized'
  )
  const escrowBalance = await connection.getTokenAccountBalance(
    new PublicKey(result.escrowAddress),
    'finalized'
  )

  const platformAta = getAssociatedTokenAddressSync(
    new PublicKey(result.mintAddress),
    mintInfo.mintAuthority ?? new PublicKey('11111111111111111111111111111111')
  )
  const platformBalance = await connection.getTokenAccountBalance(platformAta, 'finalized')

  console.log('--- On-chain verification ---')
  console.log('Mint address:', result.mintAddress)
  console.log('Escrow address:', result.escrowAddress)
  console.log('Platform ATA:', platformAta.toBase58())
  console.log('Decimals:', mintInfo.decimals)
  console.log('Supply (base units):', mintInfo.supply.toString())
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58() ?? 'null')
  console.log('Freeze authority:', mintInfo.freezeAuthority?.toBase58() ?? 'null')
  console.log('Escrow balance:', escrowBalance.value.amount)
  console.log('Escrow UI amount:', escrowBalance.value.uiAmountString)
  console.log('Platform balance:', platformBalance.value.amount)
  console.log('Platform UI amount:', platformBalance.value.uiAmountString)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
