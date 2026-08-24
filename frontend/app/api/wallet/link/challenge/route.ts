import { NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getWalletLinkMessage } from '@/lib/wallet-link'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    const { address } = await request.json()

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }

    try {
      new PublicKey(address)
    } catch {
      return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .rpc('create_wallet_link_challenge', { user_id: user.id, address })
      .single()

    if (!data) {
      return NextResponse.json({ error: 'Unable to create challenge' }, { status: 500 })
    }

    if (error) {
      const msg = error.message?.toLowerCase?.() || ''
      if (msg.includes('already linked')) {
        if (msg.includes('another') || msg.includes('other user')) {
          return NextResponse.json(
            { error: 'That address is already linked to another account.' },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: 'That address is already linked to your account.' },
          { status: 400 }
        )
      }
      console.error('[wallet-link] create_wallet_link_challenge failed:', error)
      return NextResponse.json({ error: 'Unable to create challenge' }, { status: 500 })
    }

    const result = data as { nonce: string; expires_at: string }
    const nonce = result.nonce
    const expires_at = result.expires_at
    const message = getWalletLinkMessage(address, nonce)

    return NextResponse.json({ nonce, message, expires_at })
  } catch (err: any) {
    console.error('[wallet-link] challenge error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: err.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
