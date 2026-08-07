import { Decimal } from './decimal'

// Shared number formatting for the whole app. Convention: US style
// (comma thousands separator, dot decimal separator) everywhere —
// token amounts, USDC amounts and vote counts alike — regardless of
// the browser/runtime locale. Never round-trip a decimal string
// through a JS number; all grouping below operates on digit strings.

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
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(20)
}

function toDecimal(input: string | number | null | undefined): Decimal {
  if (input === null || input === undefined) return new Decimal(BigInt(0), 0)
  try {
    const s = typeof input === 'number' ? numberToDecimalString(input) : String(input)
    return Decimal.parse(s)
  } catch {
    return new Decimal(BigInt(0), 0)
  }
}

/** Formats a USDC amount as "$1,234.56". Accepts a decimal string or a JS number. */
export function formatUsd(input: string | number | null | undefined): string {
  const d = toDecimal(input)
  const fixed = d.toFixed(2)
  const [int, frac] = fixed.split('.')
  return `$${groupIntegerDigits(int)}.${frac}`
}

/**
 * Formats a token amount, e.g. "24,812,030.075187". Trims trailing
 * zeros in the fraction (capped at maxDecimals) but never collapses
 * a nonzero value to zero.
 */
export function formatTokenAmount(
  input: string | null | undefined,
  maxDecimals = 6
): string {
  const d = toDecimal(input)
  const str = d.toString()
  const [int, frac = ''] = str.split('.')
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, '')
  return trimmed ? `${groupIntegerDigits(int)}.${trimmed}` : groupIntegerDigits(int)
}

/**
 * Formats a price, keeping enough significant fraction digits that
 * legitimately tiny early-curve prices (e.g. 0.000000265335) remain
 * meaningful instead of collapsing to "0".
 */
export function formatPrice(input: string | null | undefined, maxDecimals = 10): string {
  return formatTokenAmount(input, maxDecimals)
}

/** Formats an integer vote count as "10,000". */
export function formatVoteCount(input: number | null | undefined): string {
  const v = Number(input ?? 0)
  if (!Number.isFinite(v)) return '0'
  const rounded = Math.round(v)
  const negative = rounded < 0
  return `${negative ? '-' : ''}${groupIntegerDigits(Math.abs(rounded).toString())}`
}
