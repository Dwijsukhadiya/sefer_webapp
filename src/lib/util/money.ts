/** Money is handled in integer cents so totals never drift. */
export type Cents = number;

export const toCents = (n: number): Cents => Math.round(n * 100);
export const fromCents = (c: Cents): number => c / 100;

export const fmt = (c: Cents, currency = "USD"): string =>
  `${currency} ${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** qty × unit price, rounded to cents once at the end. */
export const extend = (qty: number, unitPrice: number): Cents => Math.round(qty * unitPrice * 100);

export const sum = (xs: Cents[]): Cents => xs.reduce((a, b) => a + b, 0);
