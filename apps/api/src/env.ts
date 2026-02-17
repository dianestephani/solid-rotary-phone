import { z } from "zod";

// Validate all required environment variables at startup.
// If any are missing, the process crashes immediately with a clear error message
// rather than failing silently at runtime when a route tries to use them.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("3001"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC", "TWILIO_ACCOUNT_SID must start with AC"),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().startsWith("+", "TWILIO_PHONE_NUMBER must be in E.164 format (+1...)"),
  SENDGRID_API_KEY: z.string().startsWith("SG.", "SENDGRID_API_KEY must start with SG."),
  SENDGRID_FROM_EMAIL: z.string().email(),
  SENDGRID_INBOUND_PARSE_SECRET: z.string().min(1),
});

// parse() throws if validation fails — intentional, we want a hard crash at startup
export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
