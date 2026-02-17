// Validate all required environment variables at startup.
// If any are missing, the process crashes immediately with a clear error message
// rather than failing silently at runtime when a route tries to use them.
//
// The schema definition lives in env-schema.ts (no side effects, safe to import
// in tests). This file contains only the parse() call that executes at startup.
import { envSchema } from "./env-schema.js";

export type { Env, envSchema } from "./env-schema.js";

// parse() throws if validation fails — intentional, we want a hard crash at startup
export const env = envSchema.parse(process.env);
