import { z } from "zod";

// DATABASE_URL accepts either:
//   - A SQLite file path:  file:./prisma/dev.db  (local development)
//   - A PostgreSQL URL:    postgresql://user:pass@host:5432/db  (production)
// z.string().url() rejects SQLite file: paths so we use a custom refinement.
const databaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL is required")
  .refine(
    (val) =>
      val.startsWith("file:") ||
      val.startsWith("postgresql://") ||
      val.startsWith("postgres://"),
    "DATABASE_URL must be a SQLite file path (file:...) or a PostgreSQL URL (postgresql://...)"
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("3001"),
  DATABASE_URL: databaseUrlSchema,
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC", "TWILIO_ACCOUNT_SID must start with AC"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  TWILIO_PHONE_NUMBER: z
    .string()
    .startsWith("+", "TWILIO_PHONE_NUMBER must be in E.164 format, e.g. +15551234567"),
  SENDGRID_API_KEY: z.string().startsWith("SG.", "SENDGRID_API_KEY must start with SG."),
  SENDGRID_FROM_EMAIL: z.string().email("SENDGRID_FROM_EMAIL must be a valid email address"),
  SENDGRID_INBOUND_PARSE_SECRET: z.string().min(1, "SENDGRID_INBOUND_PARSE_SECRET is required"),
});

export type Env = z.infer<typeof envSchema>;
