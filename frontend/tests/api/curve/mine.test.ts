import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { GET as mineCurve } from '@/app/api/curve/mine/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import {
  createCurveFixtureUser,
  createCurveFixtureStartup,
  crossToPhase2,
  cleanupCurveFixtures,
  CurveFixtureStartup,
} from './fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const userIds: string[] = []
const startupIds: string[] = []

afterAll(async () => {
  await cleanupCurveFixtures(userIds, startupIds)
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRequest(authUser?: { id: string; email: string }) {
  if (authUser) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  } else {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('Unauthorized'))
  }

  const headers: Record<string, string> = {}
  if (authUser) {
    headers.Authorization = 'Bearer mock-token'
  }

  return new Request('http://localhost:3000/api/curve/mine', {
    method: 'GET',
    headers,
  })
}

async function setupPhase2Startup(capitalTarget = 1000): Promise<CurveFixtureStartup> {
  const owner = await createCurveFixtureUser()
  userIds.push(owner.id)
  const startup = await createCurveFixtureStartup(owner.id, { capitalTarget })
  startupIds.push(startup.id)
  const voter = await createCurveFixtureUser()
  userIds.push(voter.id)
  await crossToPhase2(startup, voter.id)
  return startup
}

async function fetchHoldingText(userId: string, startupId: string) {
  const { data, error } = await supabaseAdmin
    .from('startup_holdings')
    .select('tokens::text, cost_basis::text')
    .eq('user_id', userId)
    .eq('startup_id', startupId)
    .maybeSingle()
  if (error) throw new Error(`fetchHoldingText failed: ${error.message}`)
  return data as { tokens: string; cost_basis: string } | null
}

async function fetchBalanceText(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('balances')
    .select('available_usdc::text')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`fetchBalanceText failed: ${error.message}`)
  return data?.available_usdc as string | null
}

describe('/api/curve/mine', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await mineCurve(makeRequest())
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/Unauthorized/i)
  })

  it('returns an empty list and a valid balance for a user with no holdings', async () => {
    const user = await createCurveFixtureUser(500)
    userIds.push(user.id)

    const res = await mineCurve(makeRequest(user))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.holdings).toEqual([])
    expect(typeof json.available_usdc).toBe('string')
    expect(json.available_usdc).toBe('500')
  })

  it('shows a holding after buying, with the exact token amount and cost basis as strings', async () => {
    const startup = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const buy = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 100,
    })
    expect(buy.error).toBeNull()

    const res = await mineCurve(makeRequest(trader))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.holdings).toHaveLength(1)
    const holding = json.holdings[0]
    expect(holding.startup_id).toBe(startup.id)
    expect(holding.name).toMatch(/Curve Fixture Startup/)
    expect(holding.slug).toBe(startup.slug)
    expect(holding.phase).toBe(2)
    expect(typeof holding.tokens).toBe('string')
    expect(typeof holding.cost_basis).toBe('string')
    expect(holding.current_price).toBeDefined()
    expect(holding.pool_usdc).toBeDefined()
    expect(holding.capital_target).toBeDefined()
    expect(typeof holding.progress).toBe('number')
    expect(holding.graduated).toBe(false)
    expect(holding.frozen).toBe(false)
    expect(typeof holding.spot_value_estimate).toBe('string')

    const dbHolding = await fetchHoldingText(trader.id, startup.id)
    expect(dbHolding).not.toBeNull()
    expect(holding.tokens).toBe(dbHolding!.tokens)
    expect(holding.cost_basis).toBe(String(dbHolding!.cost_basis))

    expect(json.available_usdc).toBe('900')
  })

  it('keeps token amounts as strings with full precision, not rounded JS numbers', async () => {
    const startup = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const buy = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: '33.33',
    })
    expect(buy.error).toBeNull()

    const res = await mineCurve(makeRequest(trader))
    expect(res.status).toBe(200)
    const json = await res.json()

    const holding = json.holdings[0]
    expect(typeof holding.tokens).toBe('string')
    expect(holding.tokens).toContain('.')
    expect(holding.tokens).not.toBe(Number(holding.tokens).toString())

    const dbHolding = await fetchHoldingText(trader.id, startup.id)
    expect(holding.tokens).toBe(dbHolding!.tokens)
  })

  it('reduces the displayed amount after a partial sell', async () => {
    const startup = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 100,
    })

    const before = await fetchHoldingText(trader.id, startup.id)
    expect(before).not.toBeNull()

    await supabaseAdmin.rpc('sell_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_tokens: '1',
    })

    const after = await fetchHoldingText(trader.id, startup.id)
    expect(after).not.toBeNull()
    expect(after!.tokens).not.toBe(before!.tokens)

    const res = await mineCurve(makeRequest(trader))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.holdings).toHaveLength(1)
    expect(json.holdings[0].tokens).toBe(after!.tokens)
  })

  it('removes the holding from the list after selling everything', async () => {
    const startup = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const buy = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 100,
    })
    expect(buy.error).toBeNull()

    const fullHolding = await fetchHoldingText(trader.id, startup.id)
    expect(fullHolding).not.toBeNull()

    await supabaseAdmin.rpc('sell_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_tokens: fullHolding!.tokens,
    })

    const empty = await fetchHoldingText(trader.id, startup.id)
    if (empty) {
      expect(empty.tokens).toMatch(/^0+(\.0+)?$/)
    }

    const res = await mineCurve(makeRequest(trader))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.holdings).toHaveLength(0)
  })
})
