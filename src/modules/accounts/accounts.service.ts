import { prisma } from '../../lib/prisma.js';
import { notFound, forbidden } from '../../utils/errors.js';
import { ErrorCode } from '../../utils/errors.js';
import { minorToString } from '../../utils/money.js';

// ─────────────────────────────────────────────────────────────
// Public shape of an Account returned to clients.
// NEVER return the raw Prisma row — money is BigInt and won't
// JSON-serialize. We convert to strings at this boundary.
// ─────────────────────────────────────────────────────────────

export interface PublicAccount {
  id: string;
  accountNumber: string;
  accountName: string;
  type: string;
  status: string;
  balanceMinor: string;        // kobo, as a string (JSON-safe)
  balanceFormatted: string;    // "₦1,245,800.50" — convenience for UI
  currency: string;
  createdAt: string;
  updatedAt: string;
}

function toPublicAccount(a: {
  id: string;
  accountNumber: string;
  accountName: string;
  type: string;
  status: string;
  balanceMinor: bigint;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicAccount {
  return {
    id: a.id,
    accountNumber: a.accountNumber,
    accountName: a.accountName,
    type: a.type,
    status: a.status,
    balanceMinor: minorToString(a.balanceMinor),
    balanceFormatted: formatBalance(a.balanceMinor, a.currency),
    currency: a.currency,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function formatBalance(minor: bigint, currency: string): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = frac.toString().padStart(2, '0');
  const symbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency + ' ';
  return `${negative ? '-' : ''}${symbol}${wholeStr}.${fracStr}`;
}

// ─────────────────────────────────────────────────────────────
// SERVICE FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * List all accounts belonging to a user.
 * Filtered by status = ACTIVE | FROZEN (not CLOSED).
 */
export async function listAccountsForUser(userId: string): Promise<PublicAccount[]> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      status: { not: 'CLOSED' },
    },
    orderBy: { createdAt: 'asc' },
  });
  return accounts.map(toPublicAccount);
}

/**
 * Get one account by ID.
 * Scoped to userId — a user can ONLY read their own accounts.
 * This is the IDOR defense: never trust account ID from client,
 * always verify ownership.
 */
export async function getAccountById(
  userId: string,
  accountId: string,
): Promise<PublicAccount> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw notFound('Account not found', ErrorCode.ACCOUNT_NOT_FOUND);
  }

  // Ownership check — critical.
  // Return 404, NOT 403, so attackers can't probe which IDs exist.
  if (account.userId !== userId) {
    throw notFound('Account not found', ErrorCode.ACCOUNT_NOT_FOUND);
  }

  return toPublicAccount(account);
}

/**
 * Quick balance-only endpoint.
 * Same auth check as getAccountById, but returns a minimal payload.
 * Useful for the mobile app's "pull to refresh balance".
 */
export async function getAccountBalance(
  userId: string,
  accountId: string,
): Promise<{
  accountId: string;
  balanceMinor: string;
  balanceFormatted: string;
  currency: string;
  asOf: string;
}> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      userId: true,
      balanceMinor: true,
      currency: true,
    },
  });

  if (!account || account.userId !== userId) {
    throw notFound('Account not found', ErrorCode.ACCOUNT_NOT_FOUND);
  }

  return {
    accountId: account.id,
    balanceMinor: minorToString(account.balanceMinor),
    balanceFormatted: formatBalance(account.balanceMinor, account.currency),
    currency: account.currency,
    asOf: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// LOOKUP — find account details by account number
// ─────────────────────────────────────────────────────────────
//
// Used by the transfer flow to display the recipient's name
// before the user commits to sending money.
//
// Returns ONLY public info (account name). Never the balance
// or the internal UUID. This is the same info you'd see on
// your recipient's passbook.
// ─────────────────────────────────────────────────────────────

export async function lookupAccountByNumber(
  accountNumber: string,
): Promise<{ accountNumber: string; accountName: string; bankName: string } | null> {
  const account = await prisma.account.findUnique({
    where: { accountNumber },
    select: {
      accountNumber: true,
      accountName: true,
      status: true,
    },
  });

  if (!account) return null;
  if (account.status !== 'ACTIVE') return null;

  return {
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    bankName: 'BankFlow',   // until we support interbank
  };
}