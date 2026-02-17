import { PrismaClient } from "@prisma/client";

// Singleton pattern: reuse the PrismaClient instance across hot reloads in dev.
// Without this, each file save during development opens a new connection to the
// database. For SQLite this risks file-locking conflicts; for PostgreSQL it
// exhausts the connection pool. The singleton prevents both.
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

// Re-export Prisma model types so consumers don't need @prisma/client directly.
// Enum-like string fields (Lead.status, MessageLog.direction) are NOT typed as
// enums here — import LeadStatus and MessageDirection from @crm/types instead.
export type { Lead, InboundEmail, MessageLog } from "@prisma/client";

export { Prisma } from "@prisma/client";
