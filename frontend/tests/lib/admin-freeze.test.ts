import { describe, it, expect } from 'vitest'
import { getFreezeActionBody } from '@/lib/admin-freeze'

// This covers exactly the layer that the RPC/route tests can't: what the
// admin panel itself decides to send. admin_set_curve_frozen and the
// /freeze route are both covered directly in tests/api/admin/admin.test.ts,
// but neither of those catch a caller that computes the wrong `frozen`
// value before it ever reaches the network — which is what happened here.
describe('getFreezeActionBody', () => {
  it('sends frozen: true for a startup that is not currently frozen', () => {
    expect(getFreezeActionBody(false)).toEqual({ frozen: true })
    expect(getFreezeActionBody(undefined)).toEqual({ frozen: true })
  })

  it('sends frozen: false for a startup that is currently frozen', () => {
    expect(getFreezeActionBody(true)).toEqual({ frozen: false })
  })
})
