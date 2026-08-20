import { supabaseAdmin } from './supabaseServer'

export interface RateLimitConfig {
  table: string
  windowMs: number
  maxRequests: number
}

// Limits are per authenticated user, not per IP.  They are a second line of
// defence: the underlying DB constraints (unique signatures, balance locks,
// one in-flight withdrawal, etc.) are unchanged.
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Withdrawals cost real SOL.  A handful an hour is already unusual.
  withdraw: { table: 'withdrawals', windowMs: 60 * 60 * 1000, maxRequests: 5 },

  // Paid purchases.  Stripe already handles duplicate sessions reasonably well,
  // but a user should not be able to spam checkout creation.
  checkout: { table: 'stripe_payments', windowMs: 60 * 60 * 1000, maxRequests: 10 },

  // Startup creation consumes a listing credit or USDC.  10 an hour is far
  // more than a normal user would ever need.
  listing: { table: 'startup_startups', windowMs: 60 * 60 * 1000, maxRequests: 10 },

  // Curve trades are cheap but frequent.  10 per minute is a conservative cap.
  'curve-buy': { table: 'startup_curve_trades', windowMs: 60 * 1000, maxRequests: 10 },
  'curve-sell': { table: 'startup_curve_trades', windowMs: 60 * 1000, maxRequests: 10 },

  // Voting is free and frequent by design.  60 per minute is a loose cap that
  // still stops obvious bot loops.
  vote: { table: 'startup_vote_events', windowMs: 60 * 1000, maxRequests: 60 },
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number
  limit: number
  windowMs: number
}

export async function checkRateLimit(
  userId: string,
  action: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[action]
  if (!config) {
    throw new Error(`Unknown rate limit action: ${action}`)
  }

  const since = new Date(Date.now() - config.windowMs).toISOString()
  const { count, error } = await supabaseAdmin
    .from(config.table)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) {
    throw error
  }

  const current = count ?? 0
  if (current >= config.maxRequests) {
    const { data: oldest } = await supabaseAdmin
      .from(config.table)
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    const retryAfter =
      oldest && oldest.created_at
        ? Math.max(
            0,
            Math.ceil(
              (new Date(oldest.created_at).getTime() + config.windowMs - Date.now()) / 1000
            )
          )
        : Math.ceil(config.windowMs / 1000)

    return {
      allowed: false,
      retryAfter,
      limit: config.maxRequests,
      windowMs: config.windowMs,
    }
  }

  return {
    allowed: true,
    retryAfter: 0,
    limit: config.maxRequests,
    windowMs: config.windowMs,
  }
}
