import { PrismaClient } from '@prisma/client';
import { isDev } from '../config/env.js';

// ─────────────────────────────────────────────────────────────
// Prisma singleton
// ─────────────────────────────────────────────────────────────
// In dev, `tsx watch` reloads the module on every file save.
// Without the global cache, each reload creates a NEW Prisma
// client → new connection pool → Postgres runs out of slots.
// Cache it on `globalThis` so hot reloads reuse the same client.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['warn', 'error'] : ['error'],
  });

if (isDev) {
  globalForPrisma.prisma = prisma;
}