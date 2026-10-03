import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { unauthorized } from './errors.js';
import { isRole } from '../types/auth.js';
import type { Role } from '../types/auth.js';

export interface AccessTokenPayload {
  sub: string;      // user id
  email: string;
  role: Role;
}

// ─── Access tokens ────────────────────────────────────────────

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'bankflow',
    audience: 'bankflow-client',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: jwt.JwtPayload & AccessTokenPayload;

  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'bankflow',
      audience: 'bankflow-client',
    }) as jwt.JwtPayload & AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw unauthorized('Invalid access token', 'TOKEN_INVALID');
    }
    throw err;
  }

  // Payload validation is now outside the try — its thrown AppError
  // won't be intercepted by the JWT error checks above.
  if (!decoded.sub || !decoded.email || !isRole(decoded.role)) {
    throw unauthorized('Malformed token', 'TOKEN_INVALID');
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
  };
}

// ─── Refresh tokens
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(48).toString('hex');
  const hash = hashRefreshToken(raw);
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Compute when a refresh token should expire, as a Date.
 * Parses strings like "7d", "24h", "30m", "60s".
 */
export function refreshTokenExpiry(): Date {
  const ms = parseDuration(env.JWT_REFRESH_EXPIRES_IN);
  return new Date(Date.now() + ms);
}

function parseDuration(s: string): number {
  const match = /^(\d+)([smhd])$/.exec(s);
  if (!match) throw new Error(`Invalid duration string: ${s}`);
  const n = Number(match[1]);
  const unit = match[2];
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * mult;
}