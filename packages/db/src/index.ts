/**
 * @vendoora/db — Prisma client + schema.
 *
 * Re-exports the generated Prisma client as a singleton. Consumers
 * import { prisma } from '@vendoora/db' rather than instantiating
 * their own PrismaClient (avoids connection-pool exhaustion).
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient, Prisma } from '@prisma/client';
