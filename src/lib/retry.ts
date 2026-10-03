import { logger } from './logger.js';

/**
 * Retry an async operation on transient failures.
 * Specifically handles Prisma's P2028 (transaction API error)
 * and P1001/P1002 (connection issues) which can occur when the
 * Supabase pooler restarts an idle session mid-transaction.
 *
 * Not used for business logic — only for the DB layer.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delayMs?: number; label?: string } = {},
): Promise<T> {
  const { retries = 2, delayMs = 250, label = 'operation' } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const code = (err as { code?: string })?.code;
      const isTransient =
        code === 'P2028' || // transaction API error
        code === 'P1001' || // can't reach DB
        code === 'P1002';   // timed out reaching DB

      if (!isTransient || attempt === retries) {
        throw err;
      }

      logger.warn(
        { err, attempt: attempt + 1, label },
        'Transient DB error — retrying',
      );
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }

  throw lastError;
}