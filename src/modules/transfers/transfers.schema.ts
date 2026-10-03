import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Transfer input schema
// ─────────────────────────────────────────────────────────────

export const CreateTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid().optional(),       // internal transfer (same bank)
  toAccountNumber: z
    .string()
    .regex(/^\d{10}$/, 'Account number must be 10 digits')
    .optional(),
  toBankCode: z.string().optional(),                // for external transfers (future)

  amountMinor: z
    .string()
    .regex(/^\d+$/, 'Amount must be an integer in minor units (kobo)'),

  narration: z.string().max(100).optional(),
})
  .refine(
    (data) => data.toAccountId || data.toAccountNumber,
    { message: 'Provide either toAccountId or toAccountNumber' },
  )
  .refine(
    (data) => !(data.toAccountId && data.toAccountNumber),
    { message: 'Provide only one of toAccountId or toAccountNumber, not both' },
  );

export type CreateTransferInput = z.infer<typeof CreateTransferSchema>;