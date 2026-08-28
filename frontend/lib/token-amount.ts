import { Decimal } from './decimal'

/**
 * Single conversion point for token amounts that cross the database/chain boundary.
 *
 * The database stores token quantities as decimal numbers (e.g. numeric(40,6));
 * Solana programs store the same quantities as unsigned 64-bit integers in the
 * smallest indivisible unit. This value object performs the * 10^6 conversion
 * exactly once and in one place, mirroring the discipline in lib/money.ts.
 */
export class TokenAmount {
  private constructor(
    private readonly base: Decimal,
    private readonly decimals: number
  ) {}

  static fromDatabase(value: string | number, decimals: number): TokenAmount {
    if (typeof value === 'number') {
      // Defensive: numbers from Supabase numeric can overflow JS precision. Prefer strings.
      value = value.toLocaleString('en-US', { maximumFractionDigits: 20, useGrouping: false })
    }
    const parsed = Decimal.parse(value)
    if (parsed.scale > decimals) {
      throw new Error(`Database value ${value} has more than ${decimals} decimal places`)
    }
    const factor = BigInt(10) ** BigInt(decimals - parsed.scale)
    const base = new Decimal(parsed.value * factor, decimals)
    return new TokenAmount(base, decimals)
  }

  toBaseUnit(): bigint {
    return this.base.value
  }

  toDecimal(): string {
    return this.base.toString()
  }
}
