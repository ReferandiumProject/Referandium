import { PrivyClient } from '@privy-io/server-auth'

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!
const appSecret = process.env.PRIVY_APP_SECRET!

export const privyClient = new PrivyClient(appId, appSecret)
