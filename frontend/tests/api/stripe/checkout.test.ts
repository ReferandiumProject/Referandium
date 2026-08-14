import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { POST as checkout } from '@/app/api/stripe/checkout/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { createFixtureUser, cleanupFixtures } from '../startup-votes/fixtures'

const TEST_SESSION_URL = 'https://checkout.stripe.com/test-session'
const TEST_SESSION_ID = 'cs_test_123'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('stripe', () => ({
  default: class Stripe {
    constructor() {}
    get checkout() {
      return {
        sessions: {
          create: mockCreate,
        },
      }
    }
  },
}))

function post(body: Record<string, unknown>) {
  return checkout(
    new Request('http://localhost:3000/api/stripe/checkout', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

async function paymentForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('stripe_payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`stripe_payments query failed: ${error.message}`)
  return data
}

async function paymentCount(userId: string) {
  const { count, error } = await supabaseAdmin
    .from('stripe_payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throw new Error(`stripe_payments count failed: ${error.message}`)
  return count ?? 0
}

describe('POST /api/stripe/checkout', () => {
  let authUser: Awaited<ReturnType<typeof createFixtureUser>>

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    authUser = await createFixtureUser()
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  })

  afterAll(async () => {
    await cleanupFixtures(authUser.id, [])
  })

  beforeAll(() => {
    mockCreate.mockResolvedValue({ id: TEST_SESSION_ID, url: TEST_SESSION_URL })
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(new Error('Unauthorized'))
    const res = await post({ package_id: 'listing_1' })
    expect(res.status).toBe(401)
  })

  it('rejects an unknown package with 400 and creates no row', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(authUser as any)
    const res = await post({ package_id: 'not_a_package' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown package/i)
    expect(await paymentCount(authUser.id)).toBe(0)
  })

  it('creates a pending listing-pack row with the correct credits and no release_after', async () => {
    const listingUser = await createFixtureUser()
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(listingUser as any)

    try {
      const res = await post({ package_id: 'listing_3' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.url).toBe(TEST_SESSION_URL)

      const row = await paymentForUser(listingUser.id)
      expect(row).not.toBeNull()
      expect(row!.product).toBe('listing_pack')
      expect(row!.amount_charged).toBe(2400)
      expect(row!.currency).toBe('usd')
      expect(row!.credits_granted).toBe(3)
      expect(row!.usdc_granted).toBeNull()
      expect(row!.status).toBe('pending')
      expect(row!.session_id).toBe(TEST_SESSION_ID)
      expect(row!.release_after).toBeNull()

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'payment',
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'usd',
                unit_amount: 2400,
              }),
              quantity: 1,
            }),
          ],
          metadata: expect.objectContaining({ payment_id: row!.id }),
          success_url: expect.stringContaining('checkout=success'),
          cancel_url: expect.stringContaining('checkout=cancel'),
        })
      )
    } finally {
      await cleanupFixtures(listingUser.id, [])
    }
  })

  it('creates a pending investment-pack row with the correct USDC and a 3-day release_after', async () => {
    const investmentUser = await createFixtureUser()
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(investmentUser as any)

    try {
      const res = await post({ package_id: 'investment_25' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.url).toBe(TEST_SESSION_URL)

      const row = await paymentForUser(investmentUser.id)
      expect(row).not.toBeNull()
      expect(row!.product).toBe('investment_pack')
      expect(row!.amount_charged).toBe(2500)
      expect(row!.currency).toBe('usd')
      expect(row!.usdc_granted).toBe(25)
      expect(row!.credits_granted).toBeNull()
      expect(row!.status).toBe('pending')
      expect(row!.session_id).toBe(TEST_SESSION_ID)
      expect(row!.release_after).toBeTruthy()

      const release = new Date(row!.release_after!).getTime()
      const now = Date.now()
      const threeDays = 3 * 24 * 60 * 60 * 1000
      expect(release - now).toBeGreaterThanOrEqual(threeDays - 5000)
      expect(release - now).toBeLessThanOrEqual(threeDays + 5000)

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'payment',
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'usd',
                unit_amount: 2500,
              }),
              quantity: 1,
            }),
          ],
          metadata: expect.objectContaining({ payment_id: row!.id }),
        })
      )
    } finally {
      await cleanupFixtures(investmentUser.id, [])
    }
  })

  it('ignores a client-provided amount and uses the server-side price', async () => {
    const priceUser = await createFixtureUser()
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(priceUser as any)

    try {
      const res = await post({ package_id: 'listing_1', amount: 1, credits: 999 })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.url).toBe(TEST_SESSION_URL)

      const row = await paymentForUser(priceUser.id)
      expect(row).not.toBeNull()
      expect(row!.amount_charged).toBe(800)
      expect(row!.credits_granted).toBe(1)

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: 800,
              }),
            }),
          ],
        })
      )
    } finally {
      await cleanupFixtures(priceUser.id, [])
    }
  })
})
