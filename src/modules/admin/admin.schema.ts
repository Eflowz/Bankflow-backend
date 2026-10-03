import { z } from 'zod';
import { ROLES } from '../../types/auth.js';

// ─────────────────────────────────────────────────────────────
// Admin query schemas
// ─────────────────────────────────────────────────────────────

export const AdminListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(Object.values(ROLES) as [string, ...string[]]).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
  search: z.string().min(1).max(100).optional(),
});

export const AdminListTransfersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'SUCCESSFUL', 'FAILED']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const AdminUpdateUserSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
  role: z.enum(Object.values(ROLES) as [string, ...string[]]).optional(),
});

export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;
export type AdminListTransfersQuery = z.infer<typeof AdminListTransfersQuerySchema>;
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;