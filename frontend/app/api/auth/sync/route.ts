import { NextRequest, NextResponse } from 'next/server'
import { privyClient } from '@/lib/privy-server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'

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

    // Attempt to create the user's balance row exactly once. The bonus amount
    // is included in this single insert, so a returning user cannot receive it
    // again: the balances table's unique constraint on user_id guarantees the
    // insert succeeds at most once.
    const bonusUsdc = getSignupBonusUsdc()
    const { error: balanceInsertError } = await supabaseAdmin
      .from('balances')
      .insert({
        user_id: userRecord.id,
        available_usdc: bonusUsdc ?? '0',
        locked_usdc: 0,
      })

    if (balanceInsertError) {
      const isUniqueViolation = balanceInsertError.code === '23505'
      if (!isUniqueViolation) {
        console.error('[auth/sync] balance insert failed:', balanceInsertError)
        throw balanceInsertError
      }
      console.log('[auth/sync] balance row already exists for user:', userRecord.id)
    } else if (bonusUsdc) {
      console.log(`[auth/sync] signup bonus granted: user=${userRecord.id}, amount=${bonusUsdc} USDC`)

      const { error: ledgerError } = await supabaseAdmin.from('ledger_adjustments').insert({
        user_id: userRecord.id,
        amount: bonusUsdc,
        reason: 'signup_bonus',
        note: 'Initial signup bonus credit',
      })

      if (ledgerError) {
        console.error('[auth/sync] ledger adjustment insert failed:', ledgerError)
        throw ledgerError
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
      privy_id: userRecord.privy_id,
      email: userRecord.email,
      wallet_address: userRecord.wallet_address,
      custodial_wallet_address: userRecord.custodial_wallet_address ?? null,
      available_usdc: balance?.available_usdc ?? 0,
    })
  } catch (err: any) {
    console.error('[auth/sync] unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
