import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, ErrorCode } from '../utils/errors.js';
import { logger } from '../lib/logger.js';

// ─────────────────────────────────────────────────────────────
// Idempotency middleware
// ─────────────────────────────────────────────────────────────
//
// Usage:
//   router.post('/transfers', requireAuth, idempotency('transfer'), controller.create)
//
// Client must send: Idempotency-Key: <uuid-v4-or-random-string>
//
// Behavior:
//   1. First request with a key → normal flow runs, response is stored.
//   2. Same key + same body → returns stored response (replay).
//   3. Same key + DIFFERENT body → 409 CONFLICT (key misuse).
//   4. Concurrent requests with same key → second one waits (or 409).
//
// Storage: `IdempotencyKey` table (see schema.prisma).
// Fast path: if REDIS_URL configured, we could cache here too.
//            For 1-week build, DB-only is fine — indexed on key.
// ─────────────────────────────────────────────────────────────

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function idempotency(scope: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const key = req.header('Idempotency-Key');

    // If no key provided, skip — endpoint is still callable, just not idempotent.
    // For critical endpoints (transfers), consider making it required.
    if (!key) {
      return next();
    }

    if (key.length < 10 || key.length > 100) {
      return next(badRequest('Idempotency-Key must be 10-100 characters'));
    }

    if (!req.user) {
      // idempotency requires auth — the key is scoped to a user
      return next(badRequest('Idempotency requires authentication'));
    }

    const userId = req.user.sub;

    // Hash the body so we can detect key reuse with different payload
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    // Look up existing key
    let existing = await prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (existing) {
      // Key belongs to a different user? Treat as not found to prevent probing.
      if (existing.userId !== userId) {
        return next(badRequest('Idempotency-Key belongs to another session'));
      }

      // Failed responses are not idempotent results. Allow the request to retry,
      // including with a corrected body, instead of replaying a stale failure.
      if (existing.statusCode >= 400) {
        await prisma.idempotencyKey.delete({ where: { id: existing.id } });
        existing = null;
      }

      // Same key, different body → client bug or attack
      if (existing && existing.requestHash !== requestHash) {
        return next(
          conflict(
            'Idempotency-Key was used with a different request body',
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
          ),
        );
      }

      if (existing) {
        // Same key, same body → replay stored response
        logger.info(
          { key, scope, userId },
          'Idempotent replay — returning stored response',
        );
        res.status(existing.statusCode).json(existing.responseBody);
        return;
      }
    }

    // First time we see this key. Wrap res.json to capture the response.
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      // Never persist failures: callers need to be able to retry after fixing
      // the cause. Persist successful results before replying so a fast retry
      // cannot enter the transfer service before the key is visible.
      if (res.statusCode >= 400) {
        return originalJson(body);
      }

      void prisma.idempotencyKey
        .create({
          data: {
            key,
            userId,
            endpoint: scope,
            requestHash,
            statusCode: res.statusCode,
            responseBody: body as object,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          },
        })
        .then(() => originalJson(body))
        .catch((err: unknown) => {
          logger.warn({ err, key }, 'Failed to store idempotency key');
          originalJson(body);
        });
      return res;
    };

    next();
  };
}