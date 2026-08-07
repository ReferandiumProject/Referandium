const MAX_SCALE = 18

export class Decimal {
  constructor(
    readonly value: bigint,
    readonly scale: number
  ) {}

  static parse(s: string): Decimal {
    if (typeof s !== 'string') {
      throw new Error('Decimal value must be a string')
    }
    const clean = s.trim()
    if (!/^-?\d+(\.\d+)?$/.test(clean)) {
      throw new Error(`Invalid decimal string: ${s}`)
    }
    const negative = clean.startsWith('-')
    const abs = negative ? clean.slice(1) : clean
    const [intPart, fracPart = ''] = abs.split('.')
    const scale = fracPart.length
    const value = (negative ? BigInt(-1) : BigInt(1)) * BigInt(intPart + fracPart)
    return new Decimal(value, scale)
  }

  private static pow10(n: number): bigint {
    if (n <= 0) return BigInt(1)
    return BigInt(10) ** BigInt(n)
  }

  toString(): string {
    let s = this.value.toString()
    const negative = s.startsWith('-')
    if (negative) s = s.slice(1)

    if (this.scale === 0) {
      return (negative ? '-' : '') + s
    }

    const pad = '0'.repeat(Math.max(0, this.scale - s.length))
    s = pad + s
    const int = s.slice(0, -this.scale) || '0'
    const frac = s.slice(-this.scale).replace(/0+$/, '')
    return (negative ? '-' : '') + (frac ? `${int}.${frac}` : int)
  }

  toFixed(targetScale: number): string {
    if (targetScale === this.scale) {
      return this.toString()
    }

    const negative = this.value < BigInt(0)
    const abs = negative ? -this.value : this.value

    if (targetScale > this.scale) {
      const diff = targetScale - this.scale
      const value = abs * Decimal.pow10(diff)
      const sign = negative ? '-' : ''
      const s = value.toString().padStart(targetScale + 1, '0')
      const int = s.slice(0, -targetScale) || '0'
      const frac = s.slice(-targetScale)
      return `${sign}${int}.${frac}`
    }

    const diff = this.scale - targetScale
    const factor = Decimal.pow10(diff)
    const q = abs / factor
    const r = abs % factor
    const rounded = r * BigInt(2) >= factor ? q + BigInt(1) : q
    const value = negative ? -rounded : rounded

    const sign = value < BigInt(0) ? '-' : ''
    const absValue = value < BigInt(0) ? -value : value
    const s = absValue.toString().padStart(targetScale + 1, '0')
    const int = s.slice(0, -targetScale) || '0'
    const frac = s.slice(-targetScale)
    return `${sign}${int}.${frac}`
  }

  private align(other: Decimal): { a: bigint; b: bigint; scale: number } {
    const scale = Math.max(this.scale, other.scale)
    const a = this.value * Decimal.pow10(scale - this.scale)
    const b = other.value * Decimal.pow10(scale - other.scale)
    return { a, b, scale }
  }

  add(other: Decimal): Decimal {
    const { a, b, scale } = this.align(other)
    return new Decimal(a + b, scale)
  }

  sub(other: Decimal): Decimal {
    const { a, b, scale } = this.align(other)
    return new Decimal(a - b, scale)
  }

  mul(other: Decimal, maxScale = MAX_SCALE): Decimal {
    const value = this.value * other.value
    const scale = this.scale + other.scale
    if (scale <= maxScale) {
      return new Decimal(value, scale)
    }
    const diff = scale - maxScale
    const factor = Decimal.pow10(diff)
    const q = value / factor
    const r = value % factor
    const rounded = r * BigInt(2) >= factor ? q + BigInt(1) : q
    return new Decimal(rounded, maxScale)
  }

  div(other: Decimal, targetScale: number): Decimal {
    if (other.value === BigInt(0)) {
      throw new Error('Division by zero')
    }

    const shift = other.scale + targetScale - this.scale
    let numerator: bigint
    let denominator: bigint

    if (shift >= 0) {
      numerator = this.value * Decimal.pow10(shift)
      denominator = other.value
    } else {
      numerator = this.value
      denominator = other.value * Decimal.pow10(-shift)
    }

    const negative = (numerator < BigInt(0)) !== (denominator < BigInt(0))
    const numAbs = numerator < BigInt(0) ? -numerator : numerator
    const denAbs = denominator < BigInt(0) ? -denominator : denominator
    const q = numAbs / denAbs
    const r = numAbs % denAbs
    const rounded = r * BigInt(2) >= denAbs ? q + BigInt(1) : q
    const value = negative ? -rounded : rounded
    return new Decimal(value, targetScale)
  }

  cmp(other: Decimal): number {
    const { a, b } = this.align(other)
    if (a > b) return 1
    if (a < b) return -1
    return 0
  }

  gt(other: Decimal): boolean {
    return this.cmp(other) > 0
  }

  lt(other: Decimal): boolean {
    return this.cmp(other) < 0
  }

  gte(other: Decimal): boolean {
    return this.cmp(other) >= 0
  }

  lte(other: Decimal): boolean {
    return this.cmp(other) <= 0
  }

  isZero(): boolean {
    return this.value === BigInt(0)
  }
}
