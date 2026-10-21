import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { requireBetterAuthSecret } from "#/lib/auth-config";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const composePath = resolve(workspaceRoot, "docker-compose.yml");
const envExamplePath = resolve(workspaceRoot, "apps/console/.env.example");
const gitignorePath = resolve(workspaceRoot, ".gitignore");

// The placeholder the application refuses to start with in production. Compose
// may fall back to it so `docker compose ps/logs/down` keep working without an
// exported secret, but it must never be a value that actually signs sessions.
const PUBLISHED_PLACEHOLDER = "change-me-to-at-least-32-characters";
const HISTORICAL_COMPOSE_SECRET =
  "70c18d50d2b212c625494ffb8e5963878cb72447c2ff3a0f97fcfb793f90d444";

describe("deployment secret contract", () => {
  it("never ships a usable BETTER_AUTH_SECRET default in compose", () => {
    const compose = readFileSync(composePath, "utf8");
    const line = compose.split("\n").find((candidate) => candidate.includes("BETTER_AUTH_SECRET:"));

    expect(line).toBeDefined();
    expect(line).not.toContain(HISTORICAL_COMPOSE_SECRET);

    const fallback = /\$\{BETTER_AUTH_SECRET:-([^}]*)\}/.exec(line ?? "")?.[1];

    // A non-empty fallback has to be a value production rejects; an empty one
    // would fail the env schema with a less actionable error.
    expect(fallback).toBe(PUBLISHED_PLACEHOLDER);
    expect(() => requireBetterAuthSecret(fallback, { NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_SECRET must be replaced with a deployment-specific secret",
    );
  });

  it("does not publish a production-acceptable secret in the example env file", () => {
    const example = readFileSync(envExamplePath, "utf8");
    const value = /^BETTER_AUTH_SECRET=(.+)$/m.exec(example)?.[1]?.trim() ?? "";

    expect(value).not.toBe("");
    expect(() => requireBetterAuthSecret(value, { NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_SECRET must be replaced with a deployment-specific secret",
    );
  });

  it("ignores a persisted root .env file", () => {
    const gitignore = readFileSync(gitignorePath, "utf8");

    expect(gitignore).toMatch(/^\/\.env$/m);
  });
});
