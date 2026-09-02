import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const FETCH_TIMEOUT = process.env.VITEST ? 5000 : 15000

// This is a request timeout, not a workaround.
//
// undici can write a request into a keep-alive socket the server has already
// closed as idle. The client then waits forever, because there is no error to
// surface until the socket is read from. A request timeout is the only way to
// recover from that race: the request aborts, the client retries on a fresh
// connection, and the operation reaches a known outcome.
//
// Evidence:
//   - 8,288 `buy_curve_tokens` RPC calls: 8,004 x 200, 284 x 400; slowest
//     server response 414 ms
//   - one client-side wait of 261,026 ms for a call the server had already
//     finished
//   - Postgres log_lock_waits on (1 s threshold): 0 lock waits, 0 cancelled
//     statements, 0 deadlocks
//   - undici counters at the hang: requestCreate 444, requestTrailers 443,
//     open 1 — a single request written into a dead connection
//
// Test runs use 5 s to fail fast; production uses 15 s, well above the 414 ms
// worst case and below Netlify function limits.
const originalFetch = globalThis.fetch

async function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeout)
      throw new DOMException('The operation was aborted', 'AbortError')
    }
    init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    return await originalFetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  global: { fetch: timedFetch },
})
