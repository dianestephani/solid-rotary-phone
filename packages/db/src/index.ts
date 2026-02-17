import { PrismaClient } from "@prisma/client";

// Singleton pattern: reuse the PrismaClient instance across hot reloads in dev.
// Without this, each file save during development creates a new database
// connection pool, eventually exhausting PostgreSQL's connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types so consumers don't need @prisma/client as a direct dep
export type { Contact, Outreach, OutreachChannel, OutreachStatus } from "@prisma/client";

export { Prisma } from "@prisma/client";
