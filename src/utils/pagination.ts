import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Offset-based pagination
// ─────────────────────────────────────────────────────────────
//
// WHY OFFSET (page/limit) AND NOT CURSOR?
//   Cursor is better for huge, fast-moving datasets (Twitter feeds).
//   But for a banking transaction history — where the user filters
//   by date/type/amount and expects "page 3" to be a stable thing —
//   offset pagination is simpler and more intuitive.
//
//   We'll add cursor pagination later when we build the admin
//   "recent activity" feed, where new rows arrive constantly.
//
// RESPONSE SHAPE:
//   { data: [...], page: 1, limit: 20, total: 437, totalPages: 22 }
//   - Angular reads `total` to render "Page 1 of 22".
//   - We ALWAYS return total (extra COUNT query) so the client
//     can show proper pagination UI. For very large tables you'd
//     switch to cursor to avoid the COUNT cost.
// ─────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Convert page/limit into Prisma's skip/take.
 */
export function toSkipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}