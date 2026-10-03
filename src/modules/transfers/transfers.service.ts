import { prisma } from '../../lib/prisma.js';
import { minorToString } from '../../utils/money.js';
import {
  notFound,
  badRequest,
  unprocessable,
  forbidden,
  conflict,
  ErrorCode,
} from '../../utils/errors.js';
import { audit } from '../audit/audit.service.js';
import type { CreateTransferInput } from './transfers.schema.js';
// import { Prisma } from '@prisma/client';
import { withRetry } from '../../lib/retry.js';
// import { isPrismaKnownError } from '../../utils/prisma-errors.js';

// ─────────────────────────────────────────────────────────────
// Public Transfer shape
// ─────────────────────────────────────────────────────────────

export interface PublicTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: string;
  amountFormatted: string;
  currency: string;
  narration: string | null;
  status: string;
  failureReason: string | null;
  idempotencyKey: string;
  createdAt: string;
  completedAt: string | null;
}


type TransferRow = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: bigint;
  currency: string;
  narration: string | null;
  status: string;
  failureReason: string | null;
  idempotencyKey: string;
  createdAt: Date;
  completedAt: Date | null;
};

export async function createTransfer(
  userId: string,
  idempotencyKey: string,
  input: CreateTransferInput,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<PublicTransfer> {
  const amountMinor = BigInt(input.amountMinor);

  if (amountMinor <= 0n) {
    throw badRequest('Amount must be greater than zero');
  }

  // ─── Resolve destination account ───────────────────────
  //
  // This is done OUTSIDE the main transaction because reading the
  // destination doesn't need locking — we just need to know it exists.
  let toAccount;
  if (input.toAccountId) {
    toAccount = await prisma.account.findUnique({
      where: { id: input.toAccountId },
    });
  } else if (input.toAccountNumber) {
    toAccount = await prisma.account.findUnique({
      where: { accountNumber: input.toAccountNumber },
    });
  } else {
    throw badRequest('Destination account required');
  }

  if (!toAccount) {
    throw notFound('Destination account not found', ErrorCode.ACCOUNT_NOT_FOUND);
  }

  if (toAccount.status !== 'ACTIVE') {
    throw forbidden(
      `Destination account is ${toAccount.status.toLowerCase()}`,
      ErrorCode.ACCOUNT_FROZEN,
    );
  }

  const existingTransfer = await prisma.transfer.findUnique({
    where: { idempotencyKey },
  });
  if (existingTransfer) {
    const existingSource = await prisma.account.findUnique({
      where: { id: existingTransfer.fromAccountId },
    });
    if (!existingSource || existingSource.userId !== userId) {
      throw badRequest('Idempotency-Key belongs to another session');
    }
    if (
      existingTransfer.fromAccountId !== input.fromAccountId ||
      existingTransfer.toAccountId !== toAccount.id ||
      existingTransfer.amountMinor !== amountMinor ||
      existingTransfer.narration !== (input.narration ?? null)
    ) {
      throw conflict(
        'Idempotency-Key was used with a different request body',
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
      );
    }
    return toPublicTransfer(existingTransfer, existingTransfer.currency);
  }

  // ─── Main transaction ─────────────────────────────────
  const result = await withRetry ( 
    () => prisma.$transaction(async (tx: any) => {
    // 1. Read source account + verify ownership
    const fromAccount = await tx.account.findUnique({
      where: { id: input.fromAccountId },
    });

    if (!fromAccount) {
      throw notFound('Source account not found', ErrorCode.ACCOUNT_NOT_FOUND);
    }

    if (fromAccount.userId !== userId) {
      // 404, not 403 — IDOR defense
      throw notFound('Source account not found', ErrorCode.ACCOUNT_NOT_FOUND);
    }

    if (fromAccount.status !== 'ACTIVE') {
      throw forbidden(
        `Source account is ${fromAccount.status.toLowerCase()}`,
        ErrorCode.ACCOUNT_FROZEN,
      );
    }

    // 2. Self-transfer check
    if (fromAccount.id === toAccount.id) {
      throw unprocessable(
        'Cannot transfer to the same account',
        ErrorCode.SELF_TRANSFER,
      );
    }

    // 3. Balance check
    if (fromAccount.balanceMinor < amountMinor) {
      throw unprocessable('Insufficient funds', ErrorCode.INSUFFICIENT_FUNDS);
    }

    // 4. Debit source account (atomic: only decrements if balance still >= amount)
    //
    // The `where` clause includes `balanceMinor: { gte: amountMinor }` so
    // even if another concurrent transfer drained the account between our
    // check above and this update, this update fails. That's optimistic
    // concurrency control — you never over-debit.
    const debitResult = await tx.account.updateMany({
      where: {
        id: fromAccount.id,
        balanceMinor: { gte: amountMinor },
      },
      data: {
        balanceMinor: { decrement: amountMinor },
      },
    });

    if (debitResult.count === 0) {
      // Someone else grabbed the money between our read and this update
      throw unprocessable('Insufficient funds', ErrorCode.INSUFFICIENT_FUNDS);
    }

    // 5. Credit destination account
    const credited = await tx.account.update({
      where: { id: toAccount.id },
      data: {
        balanceMinor: { increment: amountMinor },
      },
    });

    // 6. Re-read source to get authoritative post-debit balance for the snapshot
    const updatedFromAccount = await tx.account.findUniqueOrThrow({
      where: { id: fromAccount.id },
    });

    // 7. Create Transfer record
    const transfer = await tx.transfer.create({
      data: {
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amountMinor,
        currency: fromAccount.currency,
        narration: input.narration ?? null,
        status: 'SUCCESSFUL',
        idempotencyKey,
        completedAt: new Date(),
      },
    });

    // 8. Create TWO Transaction rows — one per account
    await tx.transaction.create({
      data: {
        accountId: fromAccount.id,
        type: 'TRANSFER',
        status: 'SUCCESSFUL',
        amountMinor: -amountMinor,               // NEGATIVE = debit
        balanceAfterMinor: updatedFromAccount.balanceMinor,
        currency: fromAccount.currency,
        narration: input.narration ?? `Transfer to ${toAccount.accountName}`,
        transferId: transfer.id,
      },
    });

    await tx.transaction.create({
      data: {
        accountId: toAccount.id,
        type: 'CREDIT',
        status: 'SUCCESSFUL',
        amountMinor,                             // POSITIVE = credit
        balanceAfterMinor: credited.balanceMinor,
        currency: toAccount.currency,
        narration: input.narration ?? `Transfer from ${fromAccount.accountName}`,
        transferId: transfer.id,
      },
    });

    // 9. Audit log inside the transaction — commits or rolls back with everything
    await audit(
      {
        actorId: userId,
        action: 'transfer.created',
        entity: 'Transfer',
        entityId: transfer.id,
        metadata: {
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
          amountMinor: input.amountMinor,
          currency: fromAccount.currency,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
      tx,
    );

    return { transfer, fromAccount, toAccount };
  }));

  return toPublicTransfer(result.transfer, result.fromAccount.currency);
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function toPublicTransfer(
  t: {
    id: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: bigint;
    currency: string;
    narration: string | null;
    status: string;
    failureReason: string | null;
    idempotencyKey: string;
    createdAt: Date;
    completedAt: Date | null;
  },
  currencyOverride?: string,
): PublicTransfer {
  const currency = currencyOverride ?? t.currency;
  return {
    id: t.id,
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    amountMinor: minorToString(t.amountMinor),
    amountFormatted: formatAmount(t.amountMinor, currency),
    currency,
    narration: t.narration,
    status: t.status,
    failureReason: t.failureReason,
    idempotencyKey: t.idempotencyKey,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
  };
}

function formatAmount(minor: bigint, currency: string): string {
  const whole = minor / 100n;
  const frac = minor % 100n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = frac.toString().padStart(2, '0');
  const symbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency + ' ';
  return `${symbol}${wholeStr}.${fracStr}`;
}

// ─────────────────────────────────────────────────────────────
// List transfers for a user's account
// ─────────────────────────────────────────────────────────────

export async function listTransfersForAccount(
  userId: string,
  accountId: string,
): Promise<PublicTransfer[]> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, currency: true },
  });

  if (!account || account.userId !== userId) {
    throw notFound('Account not found', ErrorCode.ACCOUNT_NOT_FOUND);
  }

const transfers = (await prisma.transfer.findMany({
  where: {
    OR: [
      { fromAccountId: accountId },
      { toAccountId: accountId },
    ],
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
})) as TransferRow[];

return transfers.map((t) => toPublicTransfer(t, account.currency));
}