import { prisma } from "@/lib/db/prisma";

let ensurePromise: Promise<void> | null = null;

/**
 * Product-ops tables are now managed by Prisma migrations.
 *
 * This function remains as a cheap readiness check so older call sites can keep
 * the same shape without doing runtime DDL in request handlers.
 */
export async function ensureProductOpsTables(): Promise<void> {
  ensurePromise ??= prisma.$queryRaw`SELECT 1`.then(() => undefined).catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}
