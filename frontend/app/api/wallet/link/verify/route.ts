import { NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2'
import bs58 from 'bs58'

ed.hashes.sha512 = sha512 as any
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getWalletLinkMessage } from '@/lib/wallet-link'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    const { address, nonce, signature } = await request.json()

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }
    if (!nonce || typeof nonce !== 'string') {
      return NextResponse.json({ error: 'nonce is required' }, { status: 400 })
    }
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'signature is required' }, { status: 400 })
    }

    let publicKey: PublicKey
    try {
      publicKey = new PublicKey(address)
    } catch {
      return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 })
    }

    let signatureBytes: Uint8Array
    try {
      signatureBytes = bs58.decode(signature)
    } catch {
      return NextResponse.json({ error: 'Invalid signature encoding' }, { status: 400 })
    }

    if (signatureBytes.length !== 64) {
      return NextResponse.json({ error: 'Invalid signature length' }, { status: 400 })
    }

    const message = new TextEncoder().encode(getWalletLinkMessage(address, nonce))
    const isValid = ed.verify(signatureBytes, message, publicKey.toBytes())

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('complete_wallet_link', {
      user_id: user.id,
      address,
      nonce,
    })

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
      if (msg.includes('expired') || msg.includes('not found') || msg.includes('invalid nonce')) {
        return NextResponse.json(
          { error: 'Challenge expired. Please start the link process again.' },
          { status: 400 }
        )
      }
      console.error('[wallet-link] complete_wallet_link failed:', error)
      return NextResponse.json({ error: 'Unable to complete wallet link' }, { status: 500 })
    }

    return NextResponse.json({ linked: true, address })
  } catch (err: any) {
    console.error('[wallet-link] verify error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: err.message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
