import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '../../utils/password.js';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from '../../utils/jwt.js';
import { badRequest, conflict, unauthorized, notFound } from '../../utils/errors.js';
import { ErrorCode } from '../../utils/errors.js';
import { RegisterInput, LoginInput } from './auth.schema.js';
import type { Role } from '../../types/auth.js';
import { Prisma } from '@prisma/client';
import { isPrismaKnownError } from '../../utils/errors.js';


// ─────────────────────────────────────────────────────────────
// Token pair — what we return to clients on register/login/refresh.
// ─────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;    // access token TTL in seconds
  tokenType: 'Bearer';
}

export interface PublicUser {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Generate a unique 10-digit account number.
 * In production this would come from a dedicated service or sequence.
 * Here: random with retry on unique-constraint collision.
 */
function generateAccountNumber(): string {
  return '30' + String(Math.floor(10000000 + Math.random() * 90000000));
}

/**
 * Issue an access + refresh token pair for a user.
 * Stores the refresh token hash in DB.
 */
async function issueTokens(
  user: { id: string; email: string; role: Role },
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const { raw: refreshToken, hash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: refreshTokenExpiry(),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
  });

  // Access token TTL in seconds — computed from env
  const expiresIn = parseDurationSeconds(env.JWT_ACCESS_EXPIRES_IN);

  return { accessToken, refreshToken, expiresIn, tokenType: 'Bearer' };
}

function parseDurationSeconds(s: string): number {
  const m = /^(\d+)([smhd])$/.exec(s);
  if (!m) return 900; // 15m default
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] ?? 1;
  return n * mult;
}

function toPublicUser(u: {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────
//
// Creates: user + their first bank account + audit log.
// All inside one DB transaction so a partial user can't exist.
//
export async function register(
  input: RegisterInput,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  // 1. Validate password strength (Zod already checked min/max)
  const problems = validatePasswordStrength(input.password);
  if (problems.length > 0) {
    throw badRequest('Password too weak', {
      fields: problems.map((p) => ({ path: 'password', message: p })),
    });
  }

  // 2. Check for existing email/phone
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
    select: { email: true, phone: true },
  });
  if (existing) {
    if (existing.email === input.email) {
      throw conflict('Email already registered', ErrorCode.EMAIL_TAKEN);
    }
    throw conflict('Phone already registered', ErrorCode.PHONE_TAKEN);
  }

  // 3. Hash password
  const passwordHash = await hashPassword(input.password);

  // 4. Create user + account + audit log in one transaction
  const result = await prisma.$transaction( async (tx:Prisma.TransactionClient) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'CUSTOMER',
      },
    });

    // First account — retry on collision
    let account = null;
    for (let attempt = 0; attempt < 5; attempt++) {
  try {
    account = await tx.account.create({
      data: {
        userId: user.id,
        accountNumber: generateAccountNumber(),
        accountName: `${input.firstName} ${input.lastName}`,
        type: 'SAVINGS',
        balanceMinor: 0n,
      },
    });
    break;
  } catch (err) {
    if (isPrismaKnownError(err, 'P2002')) {
      continue; // unique collision on accountNumber — retry
    }
    throw err;
  }
}

    if (!account) {
      throw new Error('Could not generate unique account number');
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'user.registered',
        entity: 'User',
        entityId: user.id,
        metadata: { email: user.email, accountId: account.id },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    return { user, account };
  });

  // 5. Issue tokens (outside transaction — refresh token insert is fine on its own)
  const tokens = await issueTokens(
    { id: result.user.id, email: result.user.email, role: result.user.role },
    meta,
  );

  return { user: toPublicUser(result.user), tokens };
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export async function login(
  input: LoginInput,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Generic "invalid credentials" for BOTH unknown email and wrong password.
  // NEVER reveal whether an email exists — that's user enumeration.
  if (!user) {
    throw unauthorized('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
  }

  // Check lock
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new Error(
      `Account locked until ${user.lockedUntil.toISOString()}`,
    );
  }

  // Verify password
  const ok = await verifyPassword(input.password, user.passwordHash);

  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000)
          : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'user.login.failed',
        entity: 'User',
        entityId: user.id,
        metadata: { attempts, locked: shouldLock },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    if (shouldLock) {
      throw unauthorized(
        `Account locked due to too many failed attempts. Try again in ${LOCK_DURATION_MINUTES} minutes.`,
        ErrorCode.ACCOUNT_LOCKED,
      );
    }

    throw unauthorized('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
  }

  // Success — reset counters, update lastLogin
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'user.login.success',
      entity: 'User',
      entityId: user.id,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
  });

  const tokens = await issueTokens(
    { id: user.id, email: user.email, role: user.role },
    meta,
  );

  return { user: toPublicUser(user), tokens };
}

// ─────────────────────────────────────────────────────────────
// REFRESH — rotate the refresh token
// ─────────────────────────────────────────────────────────────
//
// Flow:
//   1. Hash the presented refresh token, look it up.
//   2. If not found OR revoked OR expired → 401.
//   3. Revoke the old one (set revokedAt = now).
//   4. Issue a new pair.
//
// This is "rotating refresh tokens". Stolen tokens become useless
// once the legitimate client rotates them.
//
export async function refresh(
  rawRefreshToken: string,
  meta?: { ipAddress?: string; userAgent?: string },
): Promise<TokenPair> {
  const hash = hashRefreshToken(rawRefreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!stored) {
    throw unauthorized('Invalid refresh token', ErrorCode.TOKEN_INVALID);
  }
  if (stored.revokedAt) {
    // Reuse of a revoked token — this is a red flag.
    // In a real system, revoke ALL of this user's sessions.
    throw unauthorized('Refresh token has been revoked', ErrorCode.TOKEN_INVALID);
  }
  if (stored.expiresAt < new Date()) {
    throw unauthorized('Refresh token expired', ErrorCode.TOKEN_EXPIRED);
  }
  if (stored.user.status !== 'ACTIVE') {
    throw unauthorized('Account not active', ErrorCode.ACCOUNT_FROZEN);
  }

  // Revoke the old token
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  // Issue a new pair
  return issueTokens(
    {
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
    },
    meta,
  );
}

// ─────────────────────────────────────────────────────────────
// LOGOUT — revoke one refresh token
// ─────────────────────────────────────────────────────────────

export async function logout(rawRefreshToken: string): Promise<void> {
  const hash = hashRefreshToken(rawRefreshToken);
  // updateMany so we don't throw if the token doesn't exist
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────
// ME — return the current user
// ─────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('User not found', ErrorCode.USER_NOT_FOUND);
  return toPublicUser(user);
}