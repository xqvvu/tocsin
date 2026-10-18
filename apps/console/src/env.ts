import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

const delimitedListSchema = z
  .string()
  .transform(parseDelimitedEnvList)
  .refine((items) => items.length > 0, "Expected at least one value");

const runtimeEnv = {
  ...import.meta.env,
  ...(typeof process !== "undefined" ? process.env : {}),
};

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.url().optional(),
    BETTER_AUTH_ALLOWED_HOSTS: delimitedListSchema.optional(),
    BETTER_AUTH_TRUSTED_ORIGINS: delimitedListSchema.optional(),
    SERVER_URL: z.url().optional(),
    TOCSIN_DATABASE_PATH: z.string().min(1).optional(),
    TOCSIN_DESTINATION_TIMEOUT_MS: z.coerce
      .number<number>()
      .int()
      .positive()
      .max(30_000)
      .default(10_000),
    TOCSIN_LOG_FORMAT: z.enum(["auto", "json", "text"]).default("auto"),
    TOCSIN_LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warning", "error", "fatal", "off"])
      .default("info"),
    TOCSIN_MAX_WEBHOOK_BYTES: z.coerce
      .number<number>()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .default(1024 * 1024),
    TOCSIN_WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(10),
    TOCSIN_WORKER_INTERVAL_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
    TOCSIN_WORKER_STALE_RUNNING_MS: z.coerce
      .number<number>()
      .int()
      .positive()
      .max(60 * 60_000)
      .default(5 * 60_000),
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
  },

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv,
  isServer: typeof window === "undefined",

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});

function parseDelimitedEnvList(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    });
}
