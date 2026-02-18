-- Phase 5: make Lead.email unique for idempotent upsert on inbound email processing
-- The @@index([email]) is replaced by @@unique([email]), which creates a unique
-- index that serves both uniqueness enforcement and index-based lookups.

-- DropIndex
DROP INDEX "Lead_email_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Lead_email_key" ON "Lead"("email");
