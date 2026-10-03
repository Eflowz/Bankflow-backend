import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../utils/errors.js';
import { ErrorCode } from '../../utils/errors.js';
import { minorToString } from '../../utils/money.js';
import {
  toSkipTake,
  paginate,
  type Paginated,
} from '../../utils/pagination.js';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Query schema for GET /accounts/:id/transactions
// ─────────────────────────────────────────────────────────────

export const TransactionQuerySchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // Filters
  type: z.enum(['CREDIT', 'DEBIT', 'TRANSFER']).optional(),
  status: z.enum(['PENDING', 'SUCCESSFUL', 'FAILED', 'REVERSED']).optional(),

  // Date range (ISO strings)
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),

  // Amount range in MINOR units (strings, converted to bigint)
  minAmount: z.string().regex(/^\d+$/).optional(),
  maxAmount: z.string().regex(/^\d+$/).optional(),

  // Free-text search on narration
  search: z.string().min(1).max(100).optional(),

  // Sorting
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;

// ─────────────────────────────────────────────────────────────
// Public shape
// ─────────────────────────────────────────────────────────────

export interface PublicTransaction {
  id: string;
  accountId: string;
  type: string;
  status: string;
  amountMinor: string;
  amountFormatted: string;
  balanceAfterMinor: string;
  currency: string;
  narration: string | null;
  transferId: string | null;
  createdAt: string;
}

function toPublicTransaction(t: {
  id: string;
  accountId: string;
  type: string;
  status: string;
  amountMinor: bigint;
  balanceAfterMinor: bigint;
  currency: string;
  narration: string | null;
  transferId: string | null;
  createdAt: Date;
}): PublicTransaction {
  return {
    id: t.id,
    accountId: t.accountId,
    type: t.type,
    status: t.status,
    amountMinor: minorToString(t.amountMinor),
    amountFormatted: formatAmount(t.amountMinor, t.currency),
    balanceAfterMinor: minorToString(t.balanceAfterMinor),
    currency: t.currency,
    narration: t.narration,
    transferId: t.transferId,
    createdAt: t.createdAt.toISOString(),
  };
}

function formatAmount(minor: bigint, currency: string): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = frac.toString().padStart(2, '0');
  const symbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency + ' ';
  return `${negative ? '-' : '+'}${symbol}${wholeStr}.${fracStr}`;
}

// ─────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────

/**
 * List transactions for an account, with filtering + pagination.
 * The user must own the account.
 */
export async function listTransactions(
  userId: string,
  accountId: string,
  query: TransactionQuery,
): Promise<Paginated<PublicTransaction>> {
  // 1. Verify ownership (same IDOR defense as accounts)
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true },
  });

  if (!account || account.userId !== userId) {
    throw notFound('Account not found', ErrorCode.ACCOUNT_NOT_FOUND);
  }

  // 2. Build the Prisma `where` clause from query params
  const where: any = { accountId };

  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;

  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  if (query.minAmount || query.maxAmount) {
    where.amountMinor = {};
    // Prisma accepts BigInt for BigInt columns
    if (query.minAmount) where.amountMinor.gte = BigInt(query.minAmount);
    if (query.maxAmount) where.amountMinor.lte = BigInt(query.maxAmount);
  }

  if (query.search) {
    where.narration = { contains: query.search, mode: 'insensitive' };
  }

  // 3. Run the count and the page query in a single transaction
  //    so the two are consistent (no rows inserted between the
  //    COUNT and the SELECT).
  const { skip, take } = toSkipTake(query.page, query.limit);

  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: query.sort },
      skip,
      take,
    }),
  ]);

  // 4. Shape and paginate
  return paginate(rows.map(toPublicTransaction), total, query.page, query.limit);
}

/**
 * Get a single transaction by ID.
 * Scoped to the owning user via the account relation.
 */
export async function getTransactionById(
  userId: string,
  transactionId: string,
): Promise<PublicTransaction> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      account: { select: { userId: true } },
    },
  });

  if (!tx || tx.account.userId !== userId) {
    throw notFound('Transaction not found', ErrorCode.NOT_FOUND);
  }

  return toPublicTransaction(tx);
}