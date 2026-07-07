import { NextRequest, NextResponse } from 'next/server'
import { privyClient } from '@/lib/privy-server'
import { supabaseAdmin } from '@/lib/supabaseServer'

interface GoogleOAuthAccount {
  type: 'google_oauth'
  email: string
}

interface SolanaWalletAccount {
  type: 'wallet'
  chain: 'solana'
  address: string
}

function isGoogleOAuth(account: any): account is GoogleOAuthAccount {
  return account?.type === 'google_oauth'
}

function isSolanaWallet(account: any): account is SolanaWalletAccount {
  return account?.type === 'wallet' && account?.chain === 'solana'
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    console.log('[auth/sync] received request')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[auth/sync] missing or invalid authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    console.log('[auth/sync] extracted bearer token')

    let did: string
    try {
      const claims = await privyClient.verifyAuthToken(token)
      did = claims.userId
      console.log('[auth/sync] token verified, did:', did)
    } catch (err) {
      console.error('[auth/sync] token verification failed:', err)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const privyUser = await privyClient.getUser(did)
    console.log('[auth/sync] fetched privy user, did:', did)

    const googleAccount = privyUser.linkedAccounts.find(isGoogleOAuth) as GoogleOAuthAccount | undefined
    const email = googleAccount?.email ?? null
    console.log('[auth/sync] extracted email:', email)

    const solanaWallet = privyUser.linkedAccounts.find(isSolanaWallet) as SolanaWalletAccount | undefined
    const walletAddress = solanaWallet?.address ?? null
    console.log('[auth/sync] extracted solana wallet address:', walletAddress)

    const { data: userRecord, error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert(
        {
          privy_id: did,
          email,
          wallet_address: walletAddress,
          auth_method: 'privy',
        },
        { onConflict: 'privy_id' }
      )
      .select()
      .single()

    if (upsertError) {
      console.error('[auth/sync] user upsert failed:', upsertError)
      throw upsertError
    }

    console.log('[auth/sync] upserted user, id:', userRecord.id)

    const { data: existingBalance } = await supabaseAdmin
      .from('balances')
      .select('*')
      .eq('user_id', userRecord.id)
      .maybeSingle()

    if (!existingBalance) {
      console.log('[auth/sync] no balance row found, creating one for user:', userRecord.id)
      const { error: balanceInsertError } = await supabaseAdmin
        .from('balances')
        .insert({
          user_id: userRecord.id,
          available_usdc: 0,
          locked_usdc: 0,
        })

      if (balanceInsertError) {
        console.error('[auth/sync] balance insert failed:', balanceInsertError)
        throw balanceInsertError
      }
    } else {
      console.log('[auth/sync] balance row already exists for user:', userRecord.id)
    }

    const { data: balance, error: balanceFetchError } = await supabaseAdmin
      .from('balances')
      .select('available_usdc, locked_usdc')
      .eq('user_id', userRecord.id)
      .single()

    if (balanceFetchError) {
      console.error('[auth/sync] balance fetch failed:', balanceFetchError)
      throw balanceFetchError
    }

    console.log('[auth/sync] sync complete, returning user id:', userRecord.id)

    return NextResponse.json({
      id: userRecord.id,
      privy_id: userRecord.privy_id,
      email: userRecord.email,
      wallet_address: userRecord.wallet_address,
      available_usdc: balance?.available_usdc ?? 0,
    })
  } catch (err: any) {
    console.error('[auth/sync] unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
