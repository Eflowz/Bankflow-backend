import { prisma } from '../../lib/prisma.js';
import { minorToString } from '../../utils/money.js';
import { toSkipTake, paginate, type Paginated } from '../../utils/pagination.js';
import { notFound, ErrorCode } from '../../utils/errors.js';
import { audit } from '../audit/audit.service.js';
import type {
  AdminListUsersQuery,
  AdminListTransfersQuery,
  AdminUpdateUserInput,
} from './admin.schema.js';

// ─────────────────────────────────────────────────────────────
// Public shapes
// ─────────────────────────────────────────────────────────────

export interface AdminPublicUser {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  failedLoginAttempts: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminPublicTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: string;
  amountFormatted: string;
  currency: string;
  status: string;
  narration: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────

export async function listUsers(
  query: AdminListUsersQuery,
): Promise<Paginated<AdminPublicUser>> {
  const where: any = {};
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search } },
      { firstName: { contains: query.search, mode: 'insensitive' } },
      { lastName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = toSkipTake(query.page, query.limit);

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return paginate(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      status: u.status,
      failedLoginAttempts: u.failedLoginAttempts,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    query.page,
    query.limit,
  );
}

export async function updateUser(
  actorId: string,
  targetUserId: string,
  input: AdminUpdateUserInput,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<AdminPublicUser> {
  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!existing) {
    throw notFound('User not found', ErrorCode.USER_NOT_FOUND);
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.role && { role: input.role }),
        // If unlocking, reset failed attempts
        ...(input.status === 'ACTIVE' && {
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      },
    });

    await audit(
      {
        actorId,
        action: 'admin.user.updated',
        entity: 'User',
        entityId: targetUserId,
        metadata: {
          changes: input,
          previousRole: existing.role,
          previousStatus: existing.status,
        },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
      tx,
    );

    return user;
  });

  return {
    id: updated.id,
    email: updated.email,
    phone: updated.phone,
    firstName: updated.firstName,
    lastName: updated.lastName,
    role: updated.role,
    status: updated.status,
    failedLoginAttempts: updated.failedLoginAttempts,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Transfers
// ─────────────────────────────────────────────────────────────

export async function listTransfers(
  query: AdminListTransfersQuery,
): Promise<Paginated<AdminPublicTransfer>> {
  const where: any = {};
  if (query.status) where.status = query.status;

  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const { skip, take } = toSkipTake(query.page, query.limit);

  const [total, rows] = await prisma.$transaction([
    prisma.transfer.count({ where }),
    prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return paginate(
    rows.map((t) => ({
      id: t.id,
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      amountMinor: minorToString(t.amountMinor),
      amountFormatted: formatAmount(t.amountMinor, t.currency),
      currency: t.currency,
      status: t.status,
      narration: t.narration,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    query.page,
    query.limit,
  );
}

// ─────────────────────────────────────────────────────────────
// Stats — dashboard summary
// ─────────────────────────────────────────────────────────────

export async function getStats(): Promise<{
  totalUsers: number;
  activeUsers: number;
  totalTransfers: number;
  totalVolumeMinor: string;
  totalVolumeFormatted: string;
  asOf: string;
}> {
  const [totalUsers, activeUsers, totalTransfers, volumeSum] =
    await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.transfer.count(),
      prisma.transfer.aggregate({
        _sum: { amountMinor: true },
        where: { status: 'SUCCESSFUL' },
      }),
    ]);

  const totalVolumeMinor = volumeSum._sum.amountMinor ?? 0n;

  return {
    totalUsers,
    activeUsers,
    totalTransfers,
    totalVolumeMinor: minorToString(totalVolumeMinor),
    totalVolumeFormatted: formatAmount(totalVolumeMinor, 'NGN'),
    asOf: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatAmount(minor: bigint, currency: string): string {
  const whole = minor / 100n;
  const frac = minor % 100n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = frac.toString().padStart(2, '0');
  const symbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency + ' ';
  return `${symbol}${wholeStr}.${fracStr}`;
}