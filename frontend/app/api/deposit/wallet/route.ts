import { NextResponse } from 'next/server'

export async function POST() {
  console.log('[api/deposit] returning platform wallet deposit info')

  const platformAddress = process.env.PLATFORM_SOLANA_ADDRESS
  const usdcMint = process.env.USDC_MINT_ADDRESS

  if (!platformAddress || !usdcMint) {
    console.error('[api/deposit] missing PLATFORM_SOLANA_ADDRESS or USDC_MINT_ADDRESS env vars')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  return NextResponse.json({ platform_address: platformAddress, usdc_mint: usdcMint })
}
