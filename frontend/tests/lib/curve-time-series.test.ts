import { describe, expect, it } from 'vitest'
import {
  buildCurveTimeSeries,
  type CurveTrade,
} from '@/lib/curve-time-series'

function makeTrade(
  id: number,
  created_at: string,
  price_after: string
): CurveTrade {
  return {
    id,
    created_at,
    side: 'buy',
    usdc_gross: '1',
    tokens: '100',
    price_after,
    pool_usdc_after: '1',
  }
}

describe('buildCurveTimeSeries', () => {
  it('orders by id and advances duplicate timestamps by one second', () => {
    const base = '2026-09-03T17:32:27.464235Z'
    const trades = [
      makeTrade(1, base, '0.0000010'),
      makeTrade(2, base, '0.0000011'),
      makeTrade(3, base, '0.0000012'),
      makeTrade(4, base, '0.0000013'),
      makeTrade(5, base, '0.0000014'),
    ]

    const { data } = buildCurveTimeSeries('0.0000005', trades)

    // opening point + 5 trades = 6 points
    expect(data).toHaveLength(6)

    const baseSeconds = Math.floor(new Date(base).getTime() / 1000)
    expect(data.map((d) => d.time)).toEqual([
      baseSeconds - 1,
      baseSeconds,
      baseSeconds + 1,
      baseSeconds + 2,
      baseSeconds + 3,
      baseSeconds + 4,
    ])

    expect(data.map((d) => d.value)).toEqual([
      0.0000005,
      0.000001,
      0.0000011,
      0.0000012,
      0.0000013,
      0.0000014,
    ])
  })

  it('preserves real time gaps when timestamps differ', () => {
    const t1 = '2026-09-03T17:32:00.000Z'
    const t2 = '2026-09-03T17:33:00.000Z'
    const trades = [
      makeTrade(1, t1, '0.0000010'),
      makeTrade(2, t2, '0.0000011'),
    ]

    const { data } = buildCurveTimeSeries('0.0000005', trades)

    expect(data).toHaveLength(3)
    expect(data[1].time).toBe(Math.floor(new Date(t1).getTime() / 1000))
    expect(data[2].time).toBe(Math.floor(new Date(t2).getTime() / 1000))
  })

  it('renders a single opening price point when there are no trades', () => {
    const { data } = buildCurveTimeSeries('0.0000005', [])

    expect(data).toHaveLength(1)
    expect(data[0].value).toBe(0.0000005)
  })
})
