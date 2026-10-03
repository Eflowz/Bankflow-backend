import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/jwt.js';
import { unauthorized } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * requireAuth — verifies the Authorization: Bearer <token> header.
 * On success, attaches `req.user`. On failure, throws 401.
 *
 * Usage:
 *   router.get('/me', requireAuth, controller)
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header) {
    return next(unauthorized('Missing Authorization header'));
  }

  // Must be exactly "Bearer <token>"
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(unauthorized('Malformed Authorization header'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * optionalAuth — same as requireAuth, but doesn't fail if there's
 * no token. Useful for endpoints that behave differently for
 * logged-in vs anonymous users (e.g. public product pages).
 *
 * Not used yet, but cheap to include.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header) return next();

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return next();

  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Ignore — anonymous request
  }
  next();
}

/**
 * Convenience helper for handlers that require req.user.
 * Throws if somehow called without requireAuth (defensive).
 */
export function currentUser(req: Request): AccessTokenPayload {
  if (!req.user) {
    throw unauthorized('No authenticated user on request');
  }
  return req.user;
}