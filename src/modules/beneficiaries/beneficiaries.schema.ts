import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Beneficiary — a saved recipient the user can transfer to
// ─────────────────────────────────────────────────────────────

export const CreateBeneficiarySchema = z.object({
  accountNumber: z
    .string()
    .regex(/^\d{10}$/, 'Account number must be 10 digits'),
  accountName: z.string().min(1).max(100).trim(),
  bankName: z.string().min(1).max(100).trim(),
  nickname: z.string().min(1).max(50).trim().optional(),
});

export const UpdateBeneficiarySchema = z.object({
  accountName: z.string().min(1).max(100).trim().optional(),
  bankName: z.string().min(1).max(100).trim().optional(),
  nickname: z.string().min(1).max(50).trim().optional(),
});

export type CreateBeneficiaryInput = z.infer<typeof CreateBeneficiarySchema>;
export type UpdateBeneficiaryInput = z.infer<typeof UpdateBeneficiarySchema>;