import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextResponse } from 'next/server'
import { POST as buyCurve } from '@/app/api/curve/buy/route'
import { POST as sellCurve } from '@/app/api/curve/sell/route'
import { GET as getCurve } from '@/app/api/curve/[slug]/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import {
  createCurveFixtureUser,
  createCurveFixtureStartup,
  crossToPhase2,
  cleanupCurveFixtures,
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

function makeRequest(
  method: string,
  path: string,
  body?: any,
  authUser?: { id: string; email: string; privy_id?: string }
) {
  if (authUser) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  } else {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('Unauthorized'))
  }

  const headers: Record<string, string> = {}
  if (authUser) {
    headers.Authorization = 'Bearer mock-token'
  }

  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function setupPhase2Startup(capitalTarget = 1000) {
  const owner = await createCurveFixtureUser()
  userIds.push(owner.id)
  const startup = await createCurveFixtureStartup(owner.id, { capitalTarget })
  startupIds.push(startup.id)
  const voter = await createCurveFixtureUser()
  userIds.push(voter.id)
  await crossToPhase2(startup, voter.id)
  return startup
}

async function setupPhase1Startup() {
  const owner = await createCurveFixtureUser()
  userIds.push(owner.id)
  const startup = await createCurveFixtureStartup(owner.id, { capitalTarget: 100 })
  startupIds.push(startup.id)
  return startup
}

describe('/api/curve routes', () => {
  it('buys and sells curve tokens through the routes', { timeout: 20000 }, async () => {
    const startup = await setupPhase2Startup(1000)
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const buyRes = await buyCurve(
      makeRequest('POST', '/api/curve/buy', { startup_id: startup.id, usdc: '100' }, trader)
    )
    expect(buyRes.status).toBe(200)
    const buyJson = await buyRes.json()
    expect(buyJson.r_tokens).toBeDefined()
    expect(buyJson.r_usdc_spent).toBe('100')
    expect(buyJson.r_fee).toBe('1')
    expect(buyJson.r_pool_usdc).toBe('99')
    expect(typeof buyJson.r_progress).toBe('number')
    expect(typeof buyJson.r_graduated).toBe('boolean')

    const curveRes = await getCurve(
      makeRequest('GET', `/api/curve/${startup.slug}`, undefined, trader),
      { params: { slug: startup.slug } }
    )
    expect(curveRes.status).toBe(200)
    const curveJson = await curveRes.json()
    expect(curveJson.user_holding.tokens).toBeDefined()

    const sellRes = await sellCurve(
      makeRequest(
        'POST',
        '/api/curve/sell',
        { startup_id: startup.id, tokens: curveJson.user_holding.tokens },
        trader
      )
    )
    expect(sellRes.status).toBe(200)
    const sellJson = await sellRes.json()
    expect(Number(sellJson.r_usdc_net)).toBeCloseTo(98.01, 2)
    expect(sellJson.r_tokens_left).toBeDefined()
  })

  it('returns 401 on buy and sell when unauthenticated', { timeout: 20000 }, async () => {
    const startup = await setupPhase2Startup(1000)

    const buyRes = await buyCurve(
      makeRequest('POST', '/api/curve/buy', { startup_id: startup.id, usdc: '10' })
    )
    expect(buyRes.status).toBe(401)

    const sellRes = await sellCurve(
      makeRequest('POST', '/api/curve/sell', { startup_id: startup.id, tokens: '10' })
    )
    expect(sellRes.status).toBe(401)
  })

  it('returns 402 on insufficient balance and leaves balance unchanged', { timeout: 20000 }, async () => {
    const startup = await setupPhase2Startup(1000)
    const poor = await createCurveFixtureUser(5)
    userIds.push(poor.id)

    const res = await buyCurve(
      makeRequest('POST', '/api/curve/buy', { startup_id: startup.id, usdc: '10' }, poor)
    )
    expect(res.status).toBe(402)

    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', poor.id)
      .single()
    expect(error).toBeNull()
    expect(Number(data!.available_usdc)).toBe(5)
  })

  it('returns 409 when buying a phase-1 startup', { timeout: 20000 }, async () => {
    const startup = await setupPhase1Startup()
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    const res = await buyCurve(
      makeRequest('POST', '/api/curve/buy', { startup_id: startup.id, usdc: '10' }, trader)
    )
    expect(res.status).toBe(409)
  })

  it('returns 404 from [slug] when the startup has no curve', { timeout: 20000 }, async () => {
    const startup = await setupPhase1Startup()

    const res = await getCurve(
      makeRequest('GET', `/api/curve/${startup.slug}`),
      { params: { slug: startup.slug } }
    )
    expect(res.status).toBe(404)
  })

  it('omits personal holding fields when signed out of [slug]', { timeout: 20000 }, async () => {
    const startup = await setupPhase2Startup(1000)
    const trader = await createCurveFixtureUser(1000)
    userIds.push(trader.id)

    await buyCurve(
      makeRequest('POST', '/api/curve/buy', { startup_id: startup.id, usdc: '100' }, trader)
    )

    const signedOutRes = await getCurve(
      makeRequest('GET', `/api/curve/${startup.slug}`),
      { params: { slug: startup.slug } }
    )
    expect(signedOutRes.status).toBe(200)
    const signedOutJson = await signedOutRes.json()
    expect(signedOutJson.name).toBeDefined()
    expect(signedOutJson.pool_usdc).toBeDefined()
    expect(signedOutJson.progress).toBeDefined()
    expect(signedOutJson.user_holding).toBeUndefined()
    expect(signedOutJson.available_usdc).toBeUndefined()

    const signedInRes = await getCurve(
      makeRequest('GET', `/api/curve/${startup.slug}`, undefined, trader),
      { params: { slug: startup.slug } }
    )
    expect(signedInRes.status).toBe(200)
    const signedInJson = await signedInRes.json()
    expect(signedInJson.user_holding).toBeDefined()
    expect(signedInJson.available_usdc).toBeDefined()
  })
})
