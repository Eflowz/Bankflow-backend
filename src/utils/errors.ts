// ─────────────────────────────────────────────────────────────
// Typed application errors with stable error codes.
// The API returns these codes to clients so the frontend can
// switch on them (e.g. "INSUFFICIENT_FUNDS" → show specific UI).
// ─────────────────────────────────────────────────────────────

export const ErrorCode = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // 401
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',

  // 403
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_FROZEN: 'ACCOUNT_FROZEN',
  ACCOUNT_CLOSED: 'ACCOUNT_CLOSED',

  // 404
  NOT_FOUND: 'NOT_FOUND',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // 409
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',   // same key, different body
  DUPLICATE_BENEFICIARY: 'DUPLICATE_BENEFICIARY',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  PHONE_TAKEN: 'PHONE_TAKEN',

  // 422
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  SELF_TRANSFER: 'SELF_TRANSFER',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',

  // 423
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // 429
  RATE_LIMITED: 'RATE_LIMITED',

  // 500
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // 503
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;



/**
 * Type guard for Prisma "known" errors (P2002 unique violation, etc.)
 * Uses structural typing instead of instanceof to avoid importing
 * Prisma's internal runtime path (which is unstable across versions).
 */

export function isPrismaKnownError(
  err: unknown,
  code?: string,
): err is { code: string; meta?: Record<string, unknown> } {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('code' in err) ||
    typeof (err as { code: unknown }).code !== 'string'
  ) {
    return false;
  }
  const e = err as { code: string };
  // Prisma codes are always Pxxxx (e.g. P2002). Good enough to be confident.
  if (!/^P\d{4}$/.test(e.code)) return false;
  return code === undefined || e.code === code;
}

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCodeType,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Shorthands ──────────────────────────────────────────────

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, ErrorCode.VALIDATION_ERROR, msg, details);

export const unauthorized = (msg = 'Unauthenticated', code: ErrorCodeType = ErrorCode.UNAUTHENTICATED) =>
  new AppError(401, code, msg);

export const forbidden = (msg = 'Forbidden', code: ErrorCodeType = ErrorCode.FORBIDDEN) =>
  new AppError(403, code, msg);

export const notFound = (msg = 'Not found', code: ErrorCodeType = ErrorCode.NOT_FOUND) =>
  new AppError(404, code, msg);

export const conflict = (msg: string, code: ErrorCodeType = ErrorCode.CONFLICT) =>
  new AppError(409, code, msg);

export const unprocessable = (msg: string, code: ErrorCodeType) =>
  new AppError(422, code, msg);

export const internal = (msg = 'Internal server error') =>
  new AppError(500, ErrorCode.INTERNAL_ERROR, msg);