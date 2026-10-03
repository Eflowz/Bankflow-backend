import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../utils/errors.js';
import { logger } from '../lib/logger.js';

// ─────────────────────────────────────────────────────────────
// Global error handler — the ONLY place errors become responses.
// Every route handler just throws; Express catches and routes here.
// ─────────────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // 1. Our own typed errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 2. Zod validation errors → 400 with field-level detail
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      },
    });
    return;
  }

  // 3. Prisma known errors → map to our error codes
  const prismaCode = getPrismaErrorCode(err);
  if (prismaCode) {
    switch (prismaCode) {
      case 'P1001':
      case 'P1002':
      case 'P1008':
      case 'P1017':
      case 'P2024':
      case 'P2037':
        logger.error(
          { err, url: req.url, method: req.method },
          'Database unavailable while handling request',
        );
        res.status(503).json({
          error: {
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: 'BankFlow is temporarily unable to complete this request. Please try again shortly.',
          },
        });
        return;

      case 'P2002': {
        const meta = (err as { meta?: Record<string, unknown> }).meta;
        const target =
          (meta?.target as string[] | undefined)?.join(', ') ?? 'field';

        res.status(409).json({
          error: {
            code: ErrorCode.CONFLICT,
            message: `A record with this ${target} already exists`,
          },
        });
        return;
      }

      case 'P2025':
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Record not found',
          },
        });
        return;

      default:
        break;
    }
  }

  // 4. Unknown error — log full detail, return generic message
  logger.error(
    { err, url: req.url, method: req.method },
    'Unhandled error',
  );

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'We could not complete this request. Please try again. If the problem continues, contact support.',
    },
  });
}

function getPrismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;

  const value = err as { code?: unknown; errorCode?: unknown };
  const code = typeof value.code === 'string' ? value.code : value.errorCode;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : undefined;
}

/**
 * 404 handler — placed AFTER all routes. Express calls this when
 * no route matched. Without it, Express returns an HTML 404.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}
