import { PrivyClient } from '@privy-io/server-auth'

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!
const appSecret = process.env.PRIVY_APP_SECRET!
const authorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!

if (!authorizationPrivateKey) {
  throw new Error('PRIVY_AUTHORIZATION_PRIVATE_KEY is not set in the environment')
}

export const privyClient = new PrivyClient(appId, appSecret, {
  walletApi: { authorizationPrivateKey },
})
