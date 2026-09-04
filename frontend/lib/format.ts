import { Decimal } from './decimal'

// Shared number formatting for the whole app. Convention: US style
// (comma thousands separator, dot decimal separator) everywhere —
// token amounts, USDC amounts and vote counts alike — regardless of
// the browser/runtime locale. Never round-trip a decimal string
// through a JS number; all grouping below operates on digit strings.
//
// Fail loudly: a value that cannot be parsed is never rendered as
// 0, "0" or "" (all of which look like plausible real data). It is
// rendered as FORMAT_FALLBACK and logged to the console with enough
// context to find the offending input. `null`/`undefined` are not
// treated as parse failures — they mean "no value yet" (e.g. still
// loading) and render as FORMAT_FALLBACK without logging.

export const FORMAT_FALLBACK = '—'

function groupIntegerDigits(digits: string): string {
  const negative = digits.startsWith('-')
  const abs = negative ? digits.slice(1) : digits
  const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${withCommas}` : withCommas
}

// Converts a plain JS number into a decimal string without ever
// producing scientific notation (e.g. 2.65e-7 -> "0.000000265"),
// so it can be safely fed into Decimal.parse. Only used for inputs
// that are already plain JS numbers (e.g. vote counts, legacy
// balance fields); amounts that need exact precision should be
// passed as strings from the API instead.
function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`numberToDecimalString: not a finite number (${n})`)
  }
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(20)
}

// Throws if `input` cannot be parsed as a decimal. Callers must
// catch this themselves and decide how to surface the failure.
function parseDecimalOrThrow(input: string | number): Decimal {
  const s = typeof input === 'number' ? numberToDecimalString(input) : String(input)
  return Decimal.parse(s)
}

function groupedDecimalOrThrow(input: string | number, maxDecimals: number): string {
  const d = parseDecimalOrThrow(input)
  const str = d.toString()
  const [int, frac = ''] = str.split('.')
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, '')
  return trimmed ? `${groupIntegerDigits(int)}.${trimmed}` : groupIntegerDigits(int)
}

/** Formats a USDC amount as "$1,234.56". Accepts a decimal string or a JS number. */
export function formatUsd(
  input: string | number | null | undefined,
  decimals = 2
): string {
  if (input === null || input === undefined) return FORMAT_FALLBACK
  try {
    const d = parseDecimalOrThrow(input)
    const fixed = d.toFixed(decimals)
    const [int, frac = ''] = fixed.split('.')
    return `$${groupIntegerDigits(int)}.${frac.padEnd(decimals, '0')}`
  } catch (err) {
    console.error('[format] formatUsd: failed to parse USDC amount', { input, err })
    return FORMAT_FALLBACK
  }
}

/** Formats a raw USDC amount without the "$" symbol, e.g. "1,234.560000". */
export function formatUsdc(
  input: string | number | null | undefined,
  decimals = 6
): string {
  if (input === null || input === undefined) return FORMAT_FALLBACK
  try {
    const d = parseDecimalOrThrow(input)
    const fixed = d.toFixed(decimals)
    const [int, frac = ''] = fixed.split('.')
    return `${groupIntegerDigits(int)}.${frac.padEnd(decimals, '0')}`
  } catch (err) {
    console.error('[format] formatUsdc: failed to parse USDC amount', { input, err })
    return FORMAT_FALLBACK
  }
}

/**
 * Formats a token amount, e.g. "24,812,030.075187". Trims trailing
 * zeros in the fraction (capped at maxDecimals) but never collapses
 * a nonzero value to zero.
 */
export function formatTokenAmount(
  input: string | number | null | undefined,
  maxDecimals = 6
): string {
  if (input === null || input === undefined) return FORMAT_FALLBACK
  try {
    return groupedDecimalOrThrow(input, maxDecimals)
  } catch (err) {
    console.error('[format] formatTokenAmount: failed to parse token amount', {
      input,
      maxDecimals,
      err,
    })
    return FORMAT_FALLBACK
  }
}

/**
 * Formats a price, keeping enough significant fraction digits that
 * legitimately tiny early-curve prices (e.g. 0.000000265335) remain
 * meaningful instead of collapsing to "0".
 */
export function formatPrice(
  input: string | number | null | undefined,
  maxDecimals = 10
): string {
  if (input === null || input === undefined) return FORMAT_FALLBACK
  try {
    return groupedDecimalOrThrow(input, maxDecimals)
  } catch (err) {
    console.error('[format] formatPrice: failed to parse price', { input, maxDecimals, err })
    return FORMAT_FALLBACK
  }
}

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']

function toSubscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join('')
}

const PRICE_MIN_MOVE = 0.000000000001

function formatCompactNumber(value: number, prefix = '$'): string {
  if (value === 0 || Math.abs(value) < PRICE_MIN_MOVE) return `${prefix}0`
  let abs = Math.abs(value)
  let exp = Math.floor(Math.log10(abs))
  if (exp >= -3) {
    return `${prefix}${groupedDecimalOrThrow(abs.toString(), 6)}`
  }
  // Round to 5 significant figures first so values like 9.9999e-8 carry
  // up to 1e-7. Recompute the exponent after rounding so the zero count
  // stays correct at power-of-10 boundaries.
  const rounded = Number(abs.toPrecision(5))
  exp = Math.floor(Math.log10(rounded))
  abs = rounded
  const leadingZeros = -exp - 1
  const sig = abs * Math.pow(10, -exp)
  const sigStr = sig.toString().replace('.', '')
  return `${prefix}0.0${toSubscript(leadingZeros)}${sigStr}`
}

export function formatCompactPrice(
  input: string | number | null | undefined
): string {
  if (input === null || input === undefined) return FORMAT_FALLBACK
  try {
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return FORMAT_FALLBACK
      return formatCompactNumber(input)
    }
    try {
      const d = parseDecimalOrThrow(input)
      return formatCompactNumber(Number(d.toString()))
    } catch {
      const n = Number(input)
      if (!Number.isFinite(n)) return FORMAT_FALLBACK
      return formatCompactNumber(n)
    }
  } catch (err) {
    console.error('[format] formatCompactPrice: failed to parse price', { input, err })
    return FORMAT_FALLBACK
  }
}

/** Formats an integer vote count as "10,000". */
export function formatVoteCount(input: number | null | undefined): string {
  if (input === null || input === undefined) return FORMAT_FALLBACK
  const v = Number(input)
  if (!Number.isFinite(v)) {
    console.error('[format] formatVoteCount: failed to parse vote count', { input })
    return FORMAT_FALLBACK
  }
  const rounded = Math.round(v)
  const negative = rounded < 0
  return `${negative ? '-' : ''}${groupIntegerDigits(Math.abs(rounded).toString())}`
}
