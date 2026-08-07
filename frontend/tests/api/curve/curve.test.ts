import { describe, it, expect, afterEach } from 'vitest'
import { supabaseAdmin } from '@/lib/supabaseServer'
import {
  createCurveFixtureUser,
  createCurveFixtureStartup,
  createCurveAdminUser,
  crossToPhase2,
  cleanupCurveFixtures,
  CurveFixtureStartup,
} from './fixtures'

const PLATFORM_USER_ID = process.env.PLATFORM_SYSTEM_USER_ID!

const EPSILON = 1e-9
const CENT = 0.01

describe('Phase 2 bonding curve', () => {
  let userIds: string[] = []
  let startupIds: string[] = []

  afterEach(async () => {
    await cleanupCurveFixtures(userIds, startupIds)
    userIds = []
    startupIds = []
  })

  async function setupPhase2Startup(capitalTarget = 100) {
    const owner = await createCurveFixtureUser()
    userIds.push(owner.id)
    const startup = await createCurveFixtureStartup(owner.id, { capitalTarget })
    startupIds.push(startup.id)
    const voter = await createCurveFixtureUser()
    userIds.push(voter.id)
    await crossToPhase2(startup, voter.id)
    return { owner, startup }
  }

  async function buy(startupId: string, userId: string, usdc: number) {
    const res = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: userId,
      p_startup_id: startupId,
      p_usdc: usdc,
    })
    if (res.error) throw new Error(`buy_curve_tokens failed: ${res.error.message}`)
    return res.data![0] as {
      r_tokens: number
      r_usdc_spent: number
      r_fee: number
      r_avg_price: number
      r_pool_usdc: number
      r_progress: number
      r_graduated: boolean
    }
  }

  async function sell(startupId: string, userId: string, tokens: number | string) {
    const res = await supabaseAdmin.rpc('sell_curve_tokens', {
      p_user_id: userId,
      p_startup_id: startupId,
      p_tokens: tokens,
    })
    if (res.error) throw new Error(`sell_curve_tokens failed: ${res.error.message}`)
    return res.data![0] as {
      r_tokens_sold: number
      r_usdc_gross: number
      r_fee: number
      r_usdc_net: number
      r_tokens_left: number
      r_pool_usdc: number
    }
  }

  async function fetchCurve(startupId: string) {
    const { data, error } = await supabaseAdmin
      .from('startup_curves')
      .select('*')
      .eq('startup_id', startupId)
      .single()
    if (error) throw new Error(`fetchCurve failed: ${error.message}`)
    return data as {
      startup_id: string
      initial_v_t: number
      initial_v_s: number
      k: number
      v_t: number
      v_s: number
      capital_target: number
      graduated_at: string | null
      frozen_at: string | null
    }
  }

  async function fetchHolding(userId: string, startupId: string) {
    const { data, error } = await supabaseAdmin
      .from('startup_holdings')
      .select('tokens::text, cost_basis')
      .eq('user_id', userId)
      .eq('startup_id', startupId)
      .maybeSingle()
    if (error) throw new Error(`fetchHolding failed: ${error.message}`)
    return data as { tokens: string; cost_basis: number } | null
  }

  async function fetchBalance(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error) throw new Error(`fetchBalance failed: ${error.message}`)
    return Number(data.available_usdc)
  }

  async function fetchTrades(startupId: string) {
    const { data, error } = await supabaseAdmin
      .from('startup_curve_trades')
      .select('*')
      .eq('startup_id', startupId)
      .order('id', { ascending: true })
    if (error) throw new Error(`fetchTrades failed: ${error.message}`)
    return data as {
      id: number
      user_id: string
      startup_id: string
      side: 'buy' | 'sell'
      usdc_gross: number
      fee: number
      usdc_net: number
      tokens: number
      avg_price: number
    }[]
  }

  function assertCurveInvariant(curve: Awaited<ReturnType<typeof fetchCurve>>) {
    const vt = Number(curve.v_t)
    const vs = Number(curve.v_s)
    const k = Number(curve.k)
    const initialVt = Number(curve.initial_v_t)
    expect(vt * vs).toBeGreaterThanOrEqual(k - EPSILON)
    expect(vt).toBeGreaterThanOrEqual(initialVt - EPSILON)
    expect(vt - initialVt).toBeGreaterThanOrEqual(-EPSILON)
  }

  function expectedTokens(curve: Awaited<ReturnType<typeof fetchCurve>>, usdc: number) {
    const vt = Number(curve.v_t)
    const vs = Number(curve.v_s)
    const k = Number(curve.k)
    const net = usdc * 0.99
    return vs - k / (vt + net)
  }

  it('auto-creates a startup_curves row when Phase 1 closes', { timeout: 20000 }, async () => {
    const capitalTarget = 1000
    const { startup } = await setupPhase2Startup(capitalTarget)

    const startupRow = await supabaseAdmin
      .from('startup_startups')
      .select('phase')
      .eq('id', startup.id)
      .single()
    expect(startupRow.data!.phase).toBe(2)

    const curve = await fetchCurve(startup.id)
    expect(Number(curve.initial_v_t)).toBeCloseTo(capitalTarget * 0.3, 6)
    expect(Number(curve.initial_v_s)).toBe(100_000_000)
    expect(Number(curve.k)).toBeCloseTo(curve.initial_v_t * curve.initial_v_s, 6)
    expect(Number(curve.v_t)).toBeCloseTo(curve.initial_v_t, 6)
    expect(Number(curve.v_s)).toBe(curve.initial_v_s)
    expect(curve.graduated_at).toBeNull()
    assertCurveInvariant(curve)
  })

  it('mints tokens matching the curve formula and records the trade, fee and balance changes', { timeout: 20000 }, async () => {
    const { startup } = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const curveBefore = await fetchCurve(startup.id)
    const traderBalanceBefore = await fetchBalance(trader.id)
    const platformBalanceBefore = await fetchBalance(PLATFORM_USER_ID)

    const result = await buy(startup.id, trader.id, 100)

    expect(result.r_usdc_spent).toBe(100)
    expect(result.r_fee).toBe(1)
    expect(result.r_pool_usdc).toBe(99)

    const traderBalanceAfter = await fetchBalance(trader.id)
    const platformBalanceAfter = await fetchBalance(PLATFORM_USER_ID)
    expect(traderBalanceAfter).toBeCloseTo(traderBalanceBefore - 100, 6)
    expect(platformBalanceAfter).toBeCloseTo(platformBalanceBefore + 1, 6)

    const expected = expectedTokens(curveBefore, 100)
    const actual = Number(result.r_tokens)
    expect(actual).toBeLessThanOrEqual(expected + 1e-6)
    expect(Math.abs(actual - expected)).toBeLessThan(1e-6)

    const curveAfter = await fetchCurve(startup.id)
    expect(Number(curveAfter.v_t)).toBeCloseTo(Number(curveBefore.v_t) + 99, 6)
    assertCurveInvariant(curveAfter)

    const holding = await fetchHolding(trader.id, startup.id)
    expect(holding).not.toBeNull()
    expect(Number(holding!.tokens)).toBeCloseTo(actual, 8)

    const trades = await fetchTrades(startup.id)
    const trade = trades.find((t) => t.user_id === trader.id && t.side === 'buy')
    expect(trade).toBeDefined()
    expect(Number(trade!.usdc_gross)).toBe(100)
    expect(Number(trade!.fee)).toBe(1)
    expect(Number(trade!.usdc_net)).toBe(99)
    expect(Number(trade!.tokens)).toBeCloseTo(actual, 8)
  })

  it('accumulates holdings across multiple buys and reduces correctly on partial sells', { timeout: 20000 }, async () => {
    const { startup } = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const first = await buy(startup.id, trader.id, 50)
    const second = await buy(startup.id, trader.id, 50)

    const holdingAfterBuys = await fetchHolding(trader.id, startup.id)
    expect(holdingAfterBuys).not.toBeNull()
    expect(Number(holdingAfterBuys!.tokens)).toBeCloseTo(Number(first.r_tokens) + Number(second.r_tokens), 6)

    const sellTokens = '1'
    const tokensBeforeSell = Number(holdingAfterBuys!.tokens)
    const sellResult = await sell(startup.id, trader.id, sellTokens)

    const holdingAfterSell = await fetchHolding(trader.id, startup.id)
    expect(holdingAfterSell).not.toBeNull()
    expect(Number(holdingAfterSell!.tokens)).toBeCloseTo(Number(sellResult.r_tokens_left), 8)
    expect(Number(holdingAfterSell!.tokens)).toBeCloseTo(tokensBeforeSell - 1, 8)

    const trades = await fetchTrades(startup.id)
    const sellTrade = trades.find((t) => t.user_id === trader.id && t.side === 'sell')
    expect(sellTrade).toBeDefined()
    expect(Number(sellTrade!.tokens)).toBe(1)

    assertCurveInvariant(await fetchCurve(startup.id))
  })

  it('round trip loses exactly the two 1% fees', { timeout: 20000 }, async () => {
    const { startup } = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const balanceBefore = await fetchBalance(trader.id)
    const initialPool = Number((await fetchCurve(startup.id)).initial_v_t)

    await buy(startup.id, trader.id, 100)
    const holding = await fetchHolding(trader.id, startup.id)
    expect(holding).not.toBeNull()

    const sellResult = await sell(startup.id, trader.id, holding!.tokens)

    const expectedReturn = 100 * 0.99 * 0.99
    expect(Number(sellResult.r_usdc_net)).toBeCloseTo(expectedReturn, 2)

    const balanceAfter = await fetchBalance(trader.id)
    expect(balanceAfter).toBeCloseTo(balanceBefore - 100 + expectedReturn, 2)

    const curveAfter = await fetchCurve(startup.id)
    expect(Number(curveAfter.v_t)).toBeCloseTo(initialPool, 4)
    expect(Number(curveAfter.v_t) - Number(curveAfter.initial_v_t)).toBeGreaterThanOrEqual(-EPSILON)
    assertCurveInvariant(curveAfter)
  })

  it('stays solvent when several users buy and then fully sell back', { timeout: 30000 }, async () => {
    const { startup } = await setupPhase2Startup(10000)
    const amounts = [42, 73, 99, 151]
    const traders: { id: string; tokens: string }[] = []

    for (const amount of amounts) {
      const trader = await createCurveFixtureUser(500)
      userIds.push(trader.id)
      await buy(startup.id, trader.id, amount)
      const holding = await fetchHolding(trader.id, startup.id)
      expect(holding).not.toBeNull()
      traders.push({ id: trader.id, tokens: holding!.tokens })

      const curve = await fetchCurve(startup.id)
      assertCurveInvariant(curve)
      expect(Number(curve.v_t) - Number(curve.initial_v_t)).toBeGreaterThanOrEqual(-EPSILON)
    }

    for (const t of traders) {
      await sell(startup.id, t.id, t.tokens)
      const curve = await fetchCurve(startup.id)
      assertCurveInvariant(curve)
      expect(Number(curve.v_t) - Number(curve.initial_v_t)).toBeGreaterThanOrEqual(-EPSILON)
    }

    const curveFinal = await fetchCurve(startup.id)
    expect(Number(curveFinal.v_t)).toBeCloseTo(Number(curveFinal.initial_v_t), 4)
    expect(Number(curveFinal.v_s)).toBeCloseTo(Number(curveFinal.initial_v_s), 4)
  })

  it('does not shrink the pool across 200 minimum buy-then-sell round trips', { timeout: 120000 }, async () => {
    const { startup } = await setupPhase2Startup(1000)
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    let previousPool = Number((await fetchCurve(startup.id)).v_t) - Number((await fetchCurve(startup.id)).initial_v_t)

    for (let i = 0; i < 200; i++) {
      await buy(startup.id, trader.id, 1)
      const holding = await fetchHolding(trader.id, startup.id)
      expect(holding).not.toBeNull()
      await sell(startup.id, trader.id, holding!.tokens)

      const curve = await fetchCurve(startup.id)
      const pool = Number(curve.v_t) - Number(curve.initial_v_t)
      expect(pool).toBeGreaterThanOrEqual(previousPool - EPSILON)
      assertCurveInvariant(curve)
      previousPool = pool
    }
  })

  it('rejects a buy with insufficient balance and leaves the balance unchanged', { timeout: 20000 }, async () => {
    const { startup } = await setupPhase2Startup()
    const poor = await createCurveFixtureUser(5)
    userIds.push(poor.id)

    const balanceBefore = await fetchBalance(poor.id)
    const res = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: poor.id,
      p_startup_id: startup.id,
      p_usdc: 10,
    })

    expect(res.error).not.toBeNull()
    expect(res.error!.message).toMatch(/Insufficient balance/i)
    expect(await fetchBalance(poor.id)).toBeCloseTo(balanceBefore, 6)
  })

  it('rejects a buy below the 1 USDC minimum', { timeout: 20000 }, async () => {
    const { startup } = await setupPhase2Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const balanceBefore = await fetchBalance(trader.id)
    const res = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 0.5,
    })

    expect(res.error).not.toBeNull()
    expect(res.error!.message).toMatch(/Minimum purchase is 1 USDC/i)
    expect(await fetchBalance(trader.id)).toBeCloseTo(balanceBefore, 6)
  })

  it('rejects trading a Phase 1 startup', { timeout: 20000 }, async () => {
    const owner = await createCurveFixtureUser()
    userIds.push(owner.id)
    const startup = await createCurveFixtureStartup(owner.id, { capitalTarget: 100 })
    startupIds.push(startup.id)
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const balanceBefore = await fetchBalance(trader.id)
    const res = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 10,
    })

    expect(res.error).not.toBeNull()
    expect(res.error!.message).toMatch(/not raising capital/i)
    expect(await fetchBalance(trader.id)).toBeCloseTo(balanceBefore, 6)
  })

  it('graduates when the pool reaches the capital target and rejects further trades', { timeout: 30000 }, async () => {
    const { startup } = await setupPhase2Startup(100)
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    let graduated = false
    let attempts = 0
    while (!graduated && attempts < 20) {
      const result = await buy(startup.id, trader.id, 40)
      graduated = result.r_graduated
      attempts++
    }
    expect(graduated).toBe(true)

    const startupRow = await supabaseAdmin
      .from('startup_startups')
      .select('phase')
      .eq('id', startup.id)
      .single()
    expect(startupRow.data!.phase).toBe(3)

    const curve = await fetchCurve(startup.id)
    expect(curve.graduated_at).not.toBeNull()
    expect(Number(curve.v_t)).toBeGreaterThanOrEqual(Number(curve.initial_v_t) + Number(curve.capital_target) - EPSILON)

    const postGradBuy = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 10,
    })
    expect(postGradBuy.error).not.toBeNull()

    const postGradSell = await supabaseAdmin.rpc('sell_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_tokens: 1,
    })
    expect(postGradSell.error).not.toBeNull()
  })

  it('freezing blocks buys but still allows sells', { timeout: 30000 }, async () => {
    const { startup } = await setupPhase2Startup()
    const admin = await createCurveAdminUser()
    userIds.push(admin.id)
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    await buy(startup.id, trader.id, 10)
    const holding = await fetchHolding(trader.id, startup.id)
    expect(holding).not.toBeNull()

    const freeze = await supabaseAdmin.rpc('admin_set_curve_frozen', {
      p_admin_user_id: admin.id,
      p_frozen: true,
      p_reason: 'test freeze',
      p_startup_id: startup.id,
    })
    expect(freeze.error).toBeNull()
    expect(freeze.data).toBe(true)

    const frozenBuy = await supabaseAdmin.rpc('buy_curve_tokens', {
      p_user_id: trader.id,
      p_startup_id: startup.id,
      p_usdc: 10,
    })
    expect(frozenBuy.error).not.toBeNull()

    const sellResult = await sell(startup.id, trader.id, holding!.tokens)
    expect(Number(sellResult.r_tokens_left)).toBeCloseTo(0, 8)

    const unfreeze = await supabaseAdmin.rpc('admin_set_curve_frozen', {
      p_admin_user_id: admin.id,
      p_frozen: false,
      p_reason: 'test unfreeze',
      p_startup_id: startup.id,
    })
    expect(unfreeze.error).toBeNull()

    const afterUnfreeze = await buy(startup.id, trader.id, 10)
    expect(afterUnfreeze.r_usdc_spent).toBe(10)
  })

  it('leaves no fixture rows behind after cleanup', { timeout: 20000 }, async () => {
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .or('privy_id.ilike.did:privy:curve-%,email.ilike.curve-fixture-%')
    expect(usersError).toBeNull()
    expect(users).toHaveLength(0)

    const { data: startups, error: startupsError } = await supabaseAdmin
      .from('startup_startups')
      .select('id')
      .ilike('slug', 'curve-fixture-startup-%')
    expect(startupsError).toBeNull()
    expect(startups).toHaveLength(0)

    const { data: balances, error: balancesError } = await supabaseAdmin
      .from('balances')
      .select('id, users!inner(privy_id)')
      .ilike('users.privy_id', 'did:privy:curve-%')
    expect(balancesError).toBeNull()
    expect(balances).toHaveLength(0)

    const { data: curves, error: curvesError } = await supabaseAdmin
      .from('startup_curves')
      .select('startup_id, startup_startups!inner(slug)')
      .ilike('startup_startups.slug', 'curve-fixture-startup-%')
    expect(curvesError).toBeNull()
    expect(curves).toHaveLength(0)

    const { data: trades, error: tradesError } = await supabaseAdmin
      .from('startup_curve_trades')
      .select('id, startup_startups!inner(slug)')
      .ilike('startup_startups.slug', 'curve-fixture-startup-%')
    expect(tradesError).toBeNull()
    expect(trades).toHaveLength(0)

    const { data: holdings, error: holdingsError } = await supabaseAdmin
      .from('startup_holdings')
      .select('startup_id, startup_startups!inner(slug)')
      .ilike('startup_startups.slug', 'curve-fixture-startup-%')
    expect(holdingsError).toBeNull()
    expect(holdings).toHaveLength(0)
  })
})
