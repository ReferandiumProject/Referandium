import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { POST as createListing } from '@/app/api/startup-listings/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const PLATFORM_SYSTEM_USER_ID = '8eab2b35-eee6-41c7-843c-9b878af389f1'

describe('POST /api/startup-listings', () => {
  let fundedUser: Awaited<ReturnType<typeof createFixtureUser>>
  const createdStartupIds: string[] = []

  async function fundUser(userId: string, amount: number) {
    const { error } = await supabaseAdmin.from('balances').insert({
      user_id: userId,
      available_usdc: amount,
      locked_usdc: 0,
    } as any)
    if (error) throw new Error(`Failed to fund user: ${error.message}`)
  }

  async function currentBalance(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', userId)
      .single()
    if (error) throw new Error(`Balance query failed: ${error.message}`)
    return Number(data!.available_usdc ?? 0)
  }

  async function currentCredits(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('user_listing_credits')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`Credit query failed: ${error.message}`)
    return data?.credits ?? 0
  }

  async function platformBalance() {
    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', PLATFORM_SYSTEM_USER_ID)
      .single()
    if (error) throw new Error(`Platform balance query failed: ${error.message}`)
    return Number(data!.available_usdc ?? 0)
  }

  async function grantCredits(userId: string, credits: number) {
    const paymentId = crypto.randomUUID()
    const { data, error } = await supabaseAdmin.rpc('grant_listing_credits', {
      p_user_id: userId,
      p_credits: credits,
      p_payment_id: paymentId,
      p_reason: 'test_purchase',
    })
    if (error) throw new Error(`grant_listing_credits failed: ${error.message}`)
    return { total: Number(data ?? 0), paymentId }
  }

  async function post(body: Record<string, unknown>) {
    const req = new Request('http://localhost:3000/api/startup-listings', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return createListing(req)
  }

  beforeAll(async () => {
    fundedUser = await createFixtureUser()
    await fundUser(fundedUser.id, 100)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(fundedUser as any)
  })

  afterAll(async () => {
    await supabaseAdmin.from('balances').delete().eq('user_id', fundedUser.id)
    await cleanupFixtures(fundedUser.id, createdStartupIds, createdStartupIds)
  })

  it('creates a listing and deducts the 8 USDC fee from balance', async () => {
    const platformBefore = await platformBalance()
    const res = await post({
      name: 'Acme Launchpad',
      description: 'A thing that does stuff',
      vote_threshold: 5000,
      capital_target: 25000,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.slug).toBeDefined()
    expect(body.paid_with).toBe('balance')
    expect(body.fee).toBe(8)
    expect(body.credits_left).toBe(0)
    expect(body.available_after).toBe(92)

    createdStartupIds.push(body.id)

    expect(await currentBalance(fundedUser.id)).toBe(92)
    expect(await platformBalance()).toBe(platformBefore + 8)
  })

  it('rejects a vote_threshold below 1,000 with 400', async () => {
    const res = await post({
      name: 'Low Threshold',
      description: 'Too easy',
      vote_threshold: 999,
      capital_target: 1000,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/vote threshold/i)
    expect(body.error).toMatch(/between/i)

    const balance = await currentBalance(fundedUser.id)
    expect(balance).toBe(92)
  })

  it('rejects a capital_target below 100 with 400', async () => {
    const res = await post({
      name: 'Low Capital',
      description: 'Too small',
      vote_threshold: 10000,
      capital_target: 99,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/capital target/i)
    expect(body.error).toMatch(/between/i)

    const balance = await currentBalance(fundedUser.id)
    expect(balance).toBe(92)
  })

  it('pays with a listing credit and does not touch USDC balance', async () => {
    const creditUser = await createFixtureUser()
    await fundUser(creditUser.id, 0)
    const { total, paymentId } = await grantCredits(creditUser.id, 1)
    expect(total).toBe(1)
    expect(await currentCredits(creditUser.id)).toBe(1)

    vi.mocked(getAuthenticatedUser).mockResolvedValue(creditUser as any)
    const res = await post({
      name: 'Credit Funded Startup',
      description: 'Paid with a credit',
      vote_threshold: 5000,
      capital_target: 25000,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const startupId = body.id
    expect(body.paid_with).toBe('credit')
    expect(body.fee).toBe(0)
    expect(body.credits_left).toBe(0)
    expect(body.available_after).toBe(0)

    expect(await currentBalance(creditUser.id)).toBe(0)
    expect(await currentCredits(creditUser.id)).toBe(0)

    const { data: event } = await supabaseAdmin
      .from('listing_credit_events')
      .select('delta, startup_id, payment_id')
      .eq('startup_id', startupId)
      .single()
    expect(event).not.toBeNull()
    expect(event!.delta).toBe(-1)
    expect(event!.startup_id).toBe(startupId)
    expect(event!.payment_id).toBeNull()

    const { data: payment } = await supabaseAdmin
      .from('listing_credit_events')
      .select('delta, payment_id')
      .eq('payment_id', paymentId)
      .single()
    expect(payment).not.toBeNull()
    expect(payment!.delta).toBe(1)

    await supabaseAdmin.from('balances').delete().eq('user_id', creditUser.id)
    await cleanupFixtures(creditUser.id, [startupId], [startupId])
  })

  it('prefers a listing credit over USDC balance', async () => {
    const bothUser = await createFixtureUser()
    await fundUser(bothUser.id, 100)
    const { paymentId } = await grantCredits(bothUser.id, 1)
    expect(await currentCredits(bothUser.id)).toBe(1)

    vi.mocked(getAuthenticatedUser).mockResolvedValue(bothUser as any)
    const res = await post({
      name: 'Both Startup',
      description: 'Has credit and balance',
      vote_threshold: 5000,
      capital_target: 25000,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const startupId = body.id
    expect(body.paid_with).toBe('credit')
    expect(body.fee).toBe(0)
    expect(body.credits_left).toBe(0)
    expect(body.available_after).toBe(100)

    expect(await currentBalance(bothUser.id)).toBe(100)
    expect(await currentCredits(bothUser.id)).toBe(0)

    const { data: event } = await supabaseAdmin
      .from('listing_credit_events')
      .select('delta, startup_id')
      .eq('startup_id', startupId)
      .single()
    expect(event).not.toBeNull()
    expect(event!.delta).toBe(-1)
    expect(event!.startup_id).toBe(startupId)

    const { data: payment } = await supabaseAdmin
      .from('listing_credit_events')
      .select('delta, payment_id')
      .eq('payment_id', paymentId)
      .single()
    expect(payment).not.toBeNull()
    expect(payment!.delta).toBe(1)

    await supabaseAdmin.from('balances').delete().eq('user_id', bothUser.id)
    await cleanupFixtures(bothUser.id, [startupId], [startupId])
  })

  it('rejects a user with neither credits nor balance with 402 and does not create a startup', async () => {
    const brokeUser = await createFixtureUser()
    await fundUser(brokeUser.id, 0)

    try {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(brokeUser as any)
      const res = await post({
        name: 'Broke Startup',
        description: 'No money',
        vote_threshold: 10000,
        capital_target: 100000,
      })
      expect(res.status).toBe(402)
      const body = await res.json()
      expect(body.error).toMatch(/insufficient balance|no balance|listing credit/i)

      const { count } = await supabaseAdmin
        .from('startup_startups')
        .select('*', { count: 'exact', head: true })
        .ilike('slug', 'broke-startup%')
      expect(count).toBe(0)
    } finally {
      await supabaseAdmin.from('balances').delete().eq('user_id', brokeUser.id)
      await cleanupFixtures(brokeUser.id, [])
    }
  })

  it('rejects a user with insufficient balance and no credits with 402 and leaves balance unchanged', async () => {
    const poorUser = await createFixtureUser()
    await fundUser(poorUser.id, 5)

    try {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(poorUser as any)
      const res = await post({
        name: 'Poor Startup',
        description: 'Too little money',
        vote_threshold: 10000,
        capital_target: 100000,
      })
      expect(res.status).toBe(402)
      const body = await res.json()
      expect(body.error).toMatch(/insufficient balance|no balance|listing credit/i)

      const balance = await currentBalance(poorUser.id)
      expect(balance).toBe(5)
    } finally {
      await supabaseAdmin.from('balances').delete().eq('user_id', poorUser.id)
      await cleanupFixtures(poorUser.id, [])
    }
  })

  it('generates distinct slugs for listings with the same name', async () => {
    const baseName = 'Repeated Name'

    const first = await post({
      name: baseName,
      description: 'First one',
      vote_threshold: 5000,
      capital_target: 50000,
    })
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    createdStartupIds.push(firstBody.id)

    const second = await post({
      name: baseName,
      description: 'Second one',
      vote_threshold: 5000,
      capital_target: 50000,
    })
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    createdStartupIds.push(secondBody.id)

    expect(secondBody.slug).not.toBe(firstBody.slug)
    expect(secondBody.paid_with).toBe('balance')
    expect(secondBody.fee).toBe(8)
    expect(secondBody.available_after).toBe(firstBody.available_after - 8)
  })

  it('grant_listing_credits increases the counter and writes a matching event row', async () => {
    const grantUser = await createFixtureUser()
    const paymentId = crypto.randomUUID()

    const { data, error } = await supabaseAdmin.rpc('grant_listing_credits', {
      p_user_id: grantUser.id,
      p_credits: 5,
      p_payment_id: paymentId,
      p_reason: 'test_purchase',
    })

    expect(error).toBeNull()
    expect(data).toBe(5)
    expect(await currentCredits(grantUser.id)).toBe(5)

    const { data: event } = await supabaseAdmin
      .from('listing_credit_events')
      .select('delta, reason, payment_id, startup_id')
      .eq('user_id', grantUser.id)
      .eq('payment_id', paymentId)
      .single()
    expect(event).not.toBeNull()
    expect(event!.delta).toBe(5)
    expect(event!.reason).toBe('test_purchase')
    expect(event!.payment_id).toBe(paymentId)
    expect(event!.startup_id).toBeNull()

    await cleanupFixtures(grantUser.id, [])
  })
})

describe.sequential('POST /api/startup-listings idempotency', () => {
  let fundedUser: Awaited<ReturnType<typeof createFixtureUser>>
  const createdStartupIds: string[] = []

  async function fundUser(userId: string, amount: number) {
    const { error } = await supabaseAdmin.from('balances').insert({
      user_id: userId,
      available_usdc: amount,
      locked_usdc: 0,
    } as any)
    if (error) throw new Error(`Failed to fund user: ${error.message}`)
  }

  async function currentBalance(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', userId)
      .single()
    if (error) throw new Error(`Balance query failed: ${error.message}`)
    return Number(data!.available_usdc ?? 0)
  }

  async function postWithKey(body: Record<string, unknown>) {
    const req = new Request('http://localhost:3000/api/startup-listings', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return createListing(req)
  }

  beforeAll(async () => {
    fundedUser = await createFixtureUser()
    await fundUser(fundedUser.id, 100)
  })

  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(fundedUser as any)
  })

  afterAll(async () => {
    await supabaseAdmin.from('balances').delete().eq('user_id', fundedUser.id)
    await cleanupFixtures(fundedUser.id, createdStartupIds, createdStartupIds)
  })

  it('replays a listing with the same idempotency key without a second row or double fee', async () => {
    const key = '99999999-9999-9999-9999-999999999999'
    const body = {
      name: 'Idempotent Startup',
      description: 'A test startup for idempotency',
      vote_threshold: 5000,
      capital_target: 25000,
      idempotency_key: key,
    }

    const firstRes = await postWithKey(body)
    expect(firstRes.status).toBe(200)
    const first = await firstRes.json()
    expect(first.already_created).toBe(false)
    createdStartupIds.push(first.id)

    const balanceBefore = await currentBalance(fundedUser.id)
    const { count: countBefore } = await supabaseAdmin
      .from('startup_startups')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', fundedUser.id)

    const secondRes = await postWithKey(body)
    expect(secondRes.status).toBe(200)
    const second = await secondRes.json()
    expect(second.already_created).toBe(true)
    expect(second.id).toBe(first.id)
    expect(second.slug).toBe(first.slug)

    const balanceAfter = await currentBalance(fundedUser.id)
    const { count: countAfter } = await supabaseAdmin
      .from('startup_startups')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', fundedUser.id)

    expect(balanceAfter).toBe(balanceBefore)
    expect(countAfter).toBe(countBefore)
  })

  it('returns 409 when the same idempotency key is used with a different name', async () => {
    const key = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const firstRes = await postWithKey({
      name: 'First Name',
      description: 'A test startup',
      vote_threshold: 5000,
      capital_target: 25000,
      idempotency_key: key,
    })
    expect(firstRes.status).toBe(200)
    const first = await firstRes.json()
    createdStartupIds.push(first.id)

    const secondRes = await postWithKey({
      name: 'Different Name',
      description: 'A different test startup',
      vote_threshold: 5000,
      capital_target: 25000,
      idempotency_key: key,
    })
    expect(secondRes.status).toBe(409)
  })
})
