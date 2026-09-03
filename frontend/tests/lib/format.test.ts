import { describe, it, expect } from 'vitest'
import { formatUsd, formatUsdc, formatTokenAmount, formatPrice } from '@/lib/format'

describe('formatUsd', () => {
  it('formats an integer with custom decimals', () => {
    expect(formatUsd('10', 6)).toBe('$10.000000')
  })

  it('rounds and formats a fractional USDC amount', () => {
    expect(formatUsd('10.098001', 6)).toBe('$10.098001')
    expect(formatUsd('3.366', 6)).toBe('$3.366000')
  })

  it('uses 2 decimals by default', () => {
    expect(formatUsd('10.098001')).toBe('$10.10')
    expect(formatUsd('3.366')).toBe('$3.37')
  })

  it('handles null/undefined', () => {
    expect(formatUsd(null)).toBe('—')
    expect(formatUsd(undefined)).toBe('—')
  })
})

describe('formatUsdc', () => {
  it('formats an integer with 6 decimals', () => {
    expect(formatUsdc('10')).toBe('10.000000')
  })

  it('preserves 6 decimals for fractional amounts', () => {
    expect(formatUsdc('3.366')).toBe('3.366000')
  })
})

describe('formatTokenAmount', () => {
  it('groups large token amounts', () => {
    expect(formatTokenAmount('77095741.556284')).toBe('77,095,741.556284')
  })
})

describe('formatPrice', () => {
  it('keeps small prices meaningful', () => {
    expect(formatPrice('0.000000571858767320003333')).toBe('0.0000005718')
  })
})
