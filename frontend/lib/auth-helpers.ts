import { privyClient } from './privy-server'
import { supabaseAdmin } from './supabaseServer'

export interface AuthenticatedUser {
  id: string
  privy_id: string
  email: string | null
  wallet_address: string | null
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const token = authHeader.slice(7)

  let did: string
  try {
    const claims = await privyClient.verifyAuthToken(token)
    did = claims.userId
  } catch {
    throw new Error('Unauthorized')
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, privy_id, email, wallet_address')
    .eq('privy_id', did)
    .single()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user as AuthenticatedUser
}
