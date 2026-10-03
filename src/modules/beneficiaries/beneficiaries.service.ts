import { prisma } from '../../lib/prisma.js';
import { notFound, conflict, ErrorCode } from '../../utils/errors.js';
import { isPrismaKnownError } from '../../utils/errors.js';
import type {
  CreateBeneficiaryInput,
  UpdateBeneficiaryInput,
} from './beneficiaries.schema.js';

// ─────────────────────────────────────────────────────────────
// Public shape
// ─────────────────────────────────────────────────────────────

export interface PublicBeneficiary {
  id: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}

function toPublic(b: {
  id: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  nickname: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicBeneficiary {
  return {
    id: b.id,
    accountNumber: b.accountNumber,
    accountName: b.accountName,
    bankName: b.bankName,
    nickname: b.nickname,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────

export async function listBeneficiaries(userId: string): Promise<PublicBeneficiary[]> {
  const rows = await prisma.beneficiary.findMany({
    where: { userId },
    orderBy: [{ nickname: 'asc' }, { accountName: 'asc' }],
  });
  return rows.map(toPublic);
}

export async function createBeneficiary(
  userId: string,
  input: CreateBeneficiaryInput,
): Promise<PublicBeneficiary> {
  try {
    const beneficiary = await prisma.beneficiary.create({
      data: {
        userId,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
        bankName: input.bankName,
        nickname: input.nickname ?? null,
      },
    });
    return toPublic(beneficiary);
  } catch (err) {
    // Unique constraint: (userId, accountNumber, bankName)
    if (isPrismaKnownError(err, 'P2002')) {
      throw conflict('Beneficiary already exists', ErrorCode.DUPLICATE_BENEFICIARY);
    }
    throw err;
  }
}

export async function updateBeneficiary(
  userId: string,
  beneficiaryId: string,
  input: UpdateBeneficiaryInput,
): Promise<PublicBeneficiary> {
  // Ownership check — must own the beneficiary to update it
  const existing = await prisma.beneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { id: true, userId: true },
  });

  if (!existing || existing.userId !== userId) {
    throw notFound('Beneficiary not found', ErrorCode.NOT_FOUND);
  }

  const updated = await prisma.beneficiary.update({
    where: { id: beneficiaryId },
    data: {
      ...(input.accountName !== undefined && { accountName: input.accountName }),
      ...(input.bankName !== undefined && { bankName: input.bankName }),
      ...(input.nickname !== undefined && { nickname: input.nickname }),
    },
  });

  return toPublic(updated);
}

export async function deleteBeneficiary(
  userId: string,
  beneficiaryId: string,
): Promise<void> {
  // deleteMany returns count — returns 0 if not found or not owned
  const result = await prisma.beneficiary.deleteMany({
    where: { id: beneficiaryId, userId },
  });

  if (result.count === 0) {
    throw notFound('Beneficiary not found', ErrorCode.NOT_FOUND);
  }
}