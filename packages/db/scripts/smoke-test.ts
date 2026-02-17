/**
 * Prisma client smoke test — run manually to verify the DB layer is working.
 *
 * Usage (from repo root):
 *   DATABASE_URL="file:./prisma/dev.db" pnpm --filter @crm/db exec tsx scripts/smoke-test.ts
 *
 * This script creates real rows, verifies them, then deletes them.
 * It is safe to run repeatedly against the dev database.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["query"],
});

async function main() {
  console.log("\n--- Smoke Test: Prisma Client ---\n");

  // 1. Create a Lead
  const lead = await prisma.lead.create({
    data: {
      name: "Jane Smoke",
      email: "jane.smoke@example.com",
      phone: "+15550000001",
      status: "NEW",
    },
  });
  console.log("✓ Created Lead:", lead.id, lead.name, lead.status);

  // 2. Create a MessageLog linked to the lead
  const outboundMsg = await prisma.messageLog.create({
    data: {
      leadId: lead.id,
      direction: "OUTBOUND",
      body: "Hi Jane, reaching out about our service.",
    },
  });
  console.log("✓ Created MessageLog (OUTBOUND):", outboundMsg.id);

  const inboundMsg = await prisma.messageLog.create({
    data: {
      leadId: lead.id,
      direction: "INBOUND",
      body: "Thanks, I'm interested!",
    },
  });
  console.log("✓ Created MessageLog (INBOUND):", inboundMsg.id);

  // 3. Create an InboundEmail (no relation to Lead — intentional)
  const email = await prisma.inboundEmail.create({
    data: {
      subject: "Re: Our conversation",
      rawText: "Hi, I saw your message. Let's connect.",
      processed: false,
    },
  });
  console.log("✓ Created InboundEmail:", email.id);

  // 4. Read back the Lead with its MessageLogs
  const leadWithLogs = await prisma.lead.findUniqueOrThrow({
    where: { id: lead.id },
    include: { messageLogs: true },
  });
  console.log(
    `✓ Read Lead with ${leadWithLogs.messageLogs.length} message logs`
  );
  console.assert(
    leadWithLogs.messageLogs.length === 2,
    "Expected 2 message logs"
  );

  // 5. Update the Lead status
  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "RESPONDED", lastContactedAt: new Date() },
  });
  console.log("✓ Updated Lead status:", updated.status);

  // 6. Query by index fields
  const byEmail = await prisma.lead.findFirst({
    where: { email: "jane.smoke@example.com" },
  });
  console.assert(byEmail?.id === lead.id, "Index lookup by email failed");
  console.log("✓ Index lookup by email: OK");

  const outboundLogs = await prisma.messageLog.findMany({
    where: { leadId: lead.id, direction: "OUTBOUND" },
  });
  console.assert(outboundLogs.length === 1, "Expected 1 outbound message");
  console.log("✓ Index lookup by direction: OK");

  // 7. Verify cascade delete — deleting Lead removes its MessageLogs
  await prisma.lead.delete({ where: { id: lead.id } });
  const orphanedLogs = await prisma.messageLog.findMany({
    where: { leadId: lead.id },
  });
  console.assert(orphanedLogs.length === 0, "Cascade delete failed");
  console.log("✓ Cascade delete: MessageLogs removed with Lead");

  // 8. Clean up InboundEmail
  await prisma.inboundEmail.delete({ where: { id: email.id } });
  console.log("✓ InboundEmail deleted");

  console.log("\n--- All checks passed ---\n");
}

main()
  .catch((err) => {
    console.error("Smoke test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
