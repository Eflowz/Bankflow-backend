// ─────────────────────────────────────────────────────────────
// MONEY IN MINOR UNITS (KOBO / CENTS)
// ─────────────────────────────────────────────────────────────
//
// Rule #1: NEVER use JS `number` for money arithmetic.
//          JavaScript floats can't represent 0.1 exactly.
//          `0.1 + 0.2 === 0.30000000000000004`
//          In banking, that's a bug you get fired for.
//
// Rule #2: Store money as `bigint` in MINOR UNITS.
//          ₦1.00 = 100 kobo. $1.00 = 100 cents.
//          All DB columns for money are BIGINT.
//
// Rule #3: Only convert to major units (e.g. naira with decimals)
//          at the very edge — when formatting for display.
//
// This file is the ONLY place that converts between
// major units (user-facing) and minor units (stored).
// ─────────────────────────────────────────────────────────────

export const MINOR_UNITS_PER_MAJOR = 100n;

/**
 * Parse a user-facing amount string like "5000.50" into minor units.
 * Throws if malformed or has more than 2 decimal places.
 *
 * Why take a STRING, not a number?
 *   Because the user's input arrives as a string anyway (input field),
 *   and parsing a number first loses precision for large values.
 */
export function parseMajorToMinor(input: string): bigint {
  const trimmed = input.trim();

  // Allow optional leading sign, digits, optional . and up to 2 decimals
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid money string: "${input}"`);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  const [wholePart, fracPart = ''] = unsigned.split('.');
  const paddedFrac = fracPart.padEnd(2, '0');

  const whole = BigInt(wholePart);
  const frac = BigInt(paddedFrac);

  const minor = whole * MINOR_UNITS_PER_MAJOR + frac;
  return negative ? -minor : minor;
}

/**
 * Format minor units as a human string with currency symbol.
 * Default: Nigerian naira.
 */
export function formatMinor(
  minor: bigint,
  currency: string = 'NGN',
): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  const whole = abs / MINOR_UNITS_PER_MAJOR;
  const frac = abs % MINOR_UNITS_PER_MAJOR;

  // Group thousands with commas: 1,245,800.50
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = frac.toString().padStart(2, '0');

  const symbol = currencySymbol(currency);
  const sign = negative ? '-' : '';

  return `${sign}${symbol}${wholeStr}.${fracStr}`;
}

/**
 * JSON-safe serialization. Express can't JSON.stringify a bigint
 * by default (throws "Do not know how to serialize a BigInt").
 * We always return money to clients as a STRING to avoid precision loss
 * in JavaScript clients that parse JSON.
 *
 * Example: 124580050n → "124580050"
 * (client knows this is minor units and formats accordingly)
 */
export function minorToString(minor: bigint): string {
  return minor.toString();
}

/**
 * Add two minor amounts. Kept as a named function so it's greppable.
 * In practice you'd write `a + b` — but this documents intent.
 */
export function addMinor(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subtractMinor(a: bigint, b: bigint): bigint {
  return a - b;
}

/**
 * Safe comparison. BigInt comparisons work with <, >, ===, but
 * having named helpers improves readability at call sites.
 */
export function isNegative(minor: bigint): boolean {
  return minor < 0n;
}

export function isZero(minor: bigint): boolean {
  return minor === 0n;
}

// ─── Private helpers ────────────────────────────────────────

function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case 'NGN':
      return '₦';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return `${currency} `;
  }
}