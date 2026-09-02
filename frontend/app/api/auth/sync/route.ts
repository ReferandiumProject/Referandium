import { NextRequest, NextResponse } from 'next/server'
import { privyClient } from '@/lib/privy-server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'
import { errorResponse } from '@/lib/errorResponse'

interface GoogleOAuthAccount {
  type: 'google_oauth'
  email: string
}

interface EmbeddedSolanaWalletAccount {
  type: 'wallet'
  chainType: 'solana'
  walletClientType: 'privy'
  address: string
}

function isGoogleOAuth(account: any): account is GoogleOAuthAccount {
  return account?.type === 'google_oauth'
}

function isEmbeddedSolanaWallet(account: any): account is EmbeddedSolanaWalletAccount {
  return (
    account?.type === 'wallet' &&
    (account?.chainType === 'solana' || account?.chain === 'solana') &&
    account?.walletClientType === 'privy'
  )
}

const ZERO = Decimal.parse('0')

// DEVNET / STAGING TESTING ONLY.
// This grants newly-created accounts a starting USDC balance so multi-user
// testing on devnet is practical. The amount comes solely from server-side
// configuration (SIGNUP_BONUS_USDC). NEVER set this in production: it would
// hand out real money to anyone who signs up. Leaving the variable unset,
// empty, unparseable, or zero disables the bonus and is the safe default.
function getSignupBonusUsdc(): string | null {
  const raw = process.env.SIGNUP_BONUS_USDC
  if (!raw || raw.trim() === '') return null
  try {
    const amount = Decimal.parse(raw.trim())
    if (!amount.gt(ZERO)) return null
    return amount.toString()
  } catch {
    return null
  }
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

    const solanaWallet = privyUser.linkedAccounts.find(isEmbeddedSolanaWallet) as EmbeddedSolanaWalletAccount | undefined
    const custodialAddress = solanaWallet?.address ?? null
    console.log('[auth/sync] extracted custodial solana wallet address:', custodialAddress)

    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('id, custodial_wallet_address')
      .eq('privy_id', did)
      .maybeSingle()

    if (existingError) {
      console.error('[auth/sync] failed to fetch existing user:', existingError)
      throw existingError
    }

    let userRecord: { id: string; custodial_wallet_address: string | null }
    if (existingUser) {
      userRecord = { ...existingUser, custodial_wallet_address: existingUser.custodial_wallet_address }

      const updates: {
        email: string | null
        wallet_address: string | null
        custodial_wallet_address?: string | null
        deposits_scanned_from?: string
      } = {
        email,
        wallet_address: custodialAddress,
      }

      if (!existingUser.custodial_wallet_address) {
        updates.custodial_wallet_address = custodialAddress
        updates.deposits_scanned_from = new Date().toISOString()
        userRecord.custodial_wallet_address = custodialAddress
        console.log('[auth/sync] setting custodial wallet for', did, ':', custodialAddress)
      } else if (existingUser.custodial_wallet_address === custodialAddress) {
        console.log('[auth/sync] custodial wallet unchanged for', did)
      } else {
        console.warn(
          '[auth/sync] ignoring changed custodial wallet for',
          did,
          '. existing:',
          existingUser.custodial_wallet_address,
          'new:',
          custodialAddress
        )
      }

      const { error: updateError } = await supabaseAdmin.from('users').update(updates).eq('id', existingUser.id)

      if (updateError) {
        console.error('[auth/sync] user update failed:', updateError)
        throw updateError
      }
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          privy_id: did,
          email,
          wallet_address: custodialAddress,
          custodial_wallet_address: custodialAddress,
          deposits_scanned_from: new Date().toISOString(),
          auth_method: 'privy',
        })
        .select('id, custodial_wallet_address')
        .single()

      if (insertError) {
        // NOTE: The original 500 was not observed directly. It did not reproduce
        // once teardown removed the stale fixture user. The only throw on the
        // new-user path is this insert, so 23505 (wallet/email collision) is the
        // most likely cause. Return 409 instead of propagating a 500.
        if (insertError.code === '23505') {
          return NextResponse.json(
            { error: 'A user with this wallet or email already exists' },
            { status: 409 }
          )
        }
        console.error('[auth/sync] user insert failed:', insertError)
        throw insertError
      }

      userRecord = inserted!
    }

    console.log('[auth/sync] upserted user, id:', userRecord.id)

    const isNewUser = !existingUser

    // Create the user's balance row exactly once. If a signup bonus is
    // configured, use the atomic grant_unbacked_credit RPC; otherwise create
    // a zero balance row. Returning users already have a row, so neither
    // path runs for them.
    if (isNewUser) {
      const { error: balanceInsertError } = await supabaseAdmin.from('balances').insert({
        user_id: userRecord.id,
        available_usdc: '0',
        locked_usdc: 0,
      })

      if (balanceInsertError) {
        const isUniqueViolation = balanceInsertError.code === '23505'
        if (!isUniqueViolation) {
          console.error('[auth/sync] balance insert failed:', balanceInsertError)
          throw balanceInsertError
        }
        console.log('[auth/sync] balance row already exists for user:', userRecord.id)
      }

      const bonusUsdc = getSignupBonusUsdc()
      if (bonusUsdc) {
        const { error: grantError } = await supabaseAdmin.rpc('grant_unbacked_credit', {
          p_user_id: userRecord.id,
          p_amount: bonusUsdc,
          p_reason: 'signup_bonus',
          p_note: 'Initial signup bonus credit',
        })

        if (grantError) {
          console.error('[auth/sync] grant_unbacked_credit failed:', grantError)
          throw grantError
        }

        console.log(`[auth/sync] signup bonus granted: user=${userRecord.id}, amount=${bonusUsdc} USDC`)
      }
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
      privy_id: did,
      email,
      wallet_address: custodialAddress,
      custodial_wallet_address: userRecord.custodial_wallet_address ?? null,
      available_usdc: balance?.available_usdc ?? 0,
    })
  } catch (err: any) {
    return errorResponse({
      status: 500,
      message: err.message || 'Internal server error',
      error: err,
      request: req,
    })
  }
}
