import "dotenv/config";
import { env } from "./env.js"; // .js extension required with NodeNext module resolution
import express from "express";
import { prisma } from "@crm/db";

const app = express();
const PORT = env.PORT;

app.use(express.json());

// Health check — useful for container orchestration and uptime monitoring
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Placeholder: routes will be added as separate modules
// e.g. app.use("/contacts", contactsRouter);
// e.g. app.use("/webhooks", webhooksRouter);

async function start() {
  try {
    await prisma.$connect();
    console.log("Database connected");

    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
