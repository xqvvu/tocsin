import "@tanstack/react-start/server-only";

const BETTER_AUTH_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";
const DOCUMENTED_PLACEHOLDER_SECRET = "change-me-to-at-least-32-characters";
// Values that were published in this repository. They are long enough to pass
// the length check, so a deployment that copied them signs sessions with a key
// everyone can read. Kept here permanently: removing the literal from
// `docker-compose.yml` or `.env.example` does not rotate the secret of an
// install that already copied it.
const COMPOSE_DEFAULT_SECRET = "70c18d50d2b212c625494ffb8e5963878cb72447c2ff3a0f97fcfb793f90d444";
const EXAMPLE_ENV_SECRET = "47b719bff0508af756de6afba54ccd2deae022d1a6cb9d2c89f4f558dcd79ce2";
const PUBLISHED_SECRETS = new Set([
  BETTER_AUTH_DEFAULT_SECRET.toLowerCase(),
  DOCUMENTED_PLACEHOLDER_SECRET.toLowerCase(),
  COMPOSE_DEFAULT_SECRET.toLowerCase(),
  EXAMPLE_ENV_SECRET.toLowerCase(),
]);

export interface AuthRuntimeEnvironment {
  NODE_ENV?: string;
}

export type BetterAuthBaseUrl =
  | string
  | {
      allowedHosts: string[];
      fallback?: string | undefined;
      protocol: "auto";
    };

export interface BetterAuthBaseUrlOptions {
  allowedHosts?: string[] | undefined;
}

export function requireBetterAuthBaseUrl(
  baseUrl: string | undefined,
  environment: AuthRuntimeEnvironment = process.env,
  options: BetterAuthBaseUrlOptions = {},
): BetterAuthBaseUrl | undefined {
  const allowedHosts = options.allowedHosts ?? [];
  const trimmed = baseUrl?.trim();

  if (allowedHosts.length > 0) {
    return {
      allowedHosts,
      fallback: trimmed || undefined,
      protocol: "auto",
    };
  }

  if (trimmed) {
    return trimmed;
  }

  if (isProduction(environment)) {
    throw new Error("BETTER_AUTH_URL or SERVER_URL is required in production");
  }

  return undefined;
}

export function requireBetterAuthSecret(
  secret: string | undefined,
  environment: AuthRuntimeEnvironment = process.env,
): string | undefined {
  const trimmed = secret?.trim();

  if (!isProduction(environment)) {
    return trimmed || undefined;
  }

  if (!trimmed) {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }

  if (trimmed.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production");
  }

  if (isPlaceholderSecret(trimmed)) {
    throw new Error("BETTER_AUTH_SECRET must be replaced with a deployment-specific secret");
  }

  return trimmed;
}

function isProduction(environment: AuthRuntimeEnvironment): boolean {
  return environment.NODE_ENV === "production";
}

function isPlaceholderSecret(secret: string): boolean {
  // Normalize so a case variant of a published value cannot slip through.
  return PUBLISHED_SECRETS.has(secret.trim().toLowerCase());
}
