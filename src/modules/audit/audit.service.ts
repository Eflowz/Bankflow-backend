import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import type {  JsonValue } from '../../types/json.js';


//Audit logging

interface AuditInput {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: JsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export async function audit(
  input: AuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;

  try {
    await client.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        metadata: input.metadata as any,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  } catch (err) {
    // Never let audit failure break business logic
    // eslint-disable-next-line no-console
    console.warn('Audit log failed:', err);
  }
}