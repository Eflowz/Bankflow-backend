import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Zod schemas for auth endpoints.
// These validate the raw request body. If they fail, the error
// handler converts the ZodError into a 400 with field-level detail.
// ─────────────────────────────────────────────────────────────

// Nigerian phone: +234xxxxxxxxxx
const phoneRegex = /^(\+234|0)[789][01]\d{8}$/;

export const RegisterSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  phone: z.string().regex(phoneRegex, 'Invalid Nigerian phone number'),
  password: z.string().min(8).max(72),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
});

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;