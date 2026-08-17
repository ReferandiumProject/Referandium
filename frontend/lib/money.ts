/**
 * Single conversion point for all money that crosses the Stripe/database boundary.
 *
 * Stripe represents money as integer cents; the database stores the same money in dollars.
 * The `Money` value object hides the cent representation, exposes construction only through
 * named factories, and returns unit-branded numbers at its boundaries. This makes it a type
 * error to pass a raw Stripe cent amount where a database dollar amount is expected, or vice
 * versa, without first going through the adapter.
 */

export type Cents = number & { readonly __unit: 'cents' }
export type Dollars = number & { readonly __unit: 'dollars' }

function asCents(value: number): Cents {
  return Math.round(value) as Cents
}

function asDollars(value: number): Dollars {
  return Number(value.toFixed(6)) as Dollars
}

export class Money {
  private constructor(private readonly cents: number) {}

  /** Convert from Stripe's integer cent representation. */
  static fromCents(value: number): Money {
    return new Money(Math.round(value))
  }

  /** Convert from a database dollar amount (2 decimal places expected). */
  static fromDollars(value: number): Money {
    return new Money(Math.round(value * 100))
  }

  toCents(): Cents {
    return asCents(this.cents)
  }

  toDollars(): Dollars {
    return asDollars(this.cents / 100)
  }

  minus(other: Money): Money {
    return new Money(Math.round(this.cents - other.cents))
  }

  plus(other: Money): Money {
    return new Money(Math.round(this.cents + other.cents))
  }

  dividedBy(factor: number): Money {
    return new Money(Math.round(this.cents / factor))
  }

  multipliedBy(factor: number): Money {
    return new Money(Math.round(this.cents * factor))
  }
}
