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
    const lines = compose.split("\n");
    // Anchor the match so the adjacent `BETTER_AUTH_SECRET_FILE:` line and any
    // comment mentioning the variable cannot be picked up as the value line.
    const line = lines.find((candidate) => /^\s+BETTER_AUTH_SECRET:/.test(candidate));

    expect(line).toBeDefined();
    expect(line).not.toContain(HISTORICAL_COMPOSE_SECRET);

    // The fallback is empty rather than a placeholder: a non-empty fallback
    // would shadow `BETTER_AUTH_SECRET_FILE` (an inline value always wins), and
    // an empty value still fails closed in production.
    const fallback = /\$\{BETTER_AUTH_SECRET:-([^}]*)\}/.exec(line ?? "")?.[1];
    expect(fallback).toBe("");
    expect(() => requireBetterAuthSecret(fallback, { NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_SECRET is required in production",
    );
    // The published placeholder stays rejected even though compose no longer
    // ships it: an install that already copied it must still fail closed.
    expect(() =>
      requireBetterAuthSecret(PUBLISHED_PLACEHOLDER, { NODE_ENV: "production" }),
    ).toThrow("BETTER_AUTH_SECRET must be replaced with a deployment-specific secret");

    const fileLine = lines.find((candidate) => /^\s+BETTER_AUTH_SECRET_FILE:/.test(candidate));
    expect(fileLine).toBeDefined();
    expect(fileLine).toContain("${BETTER_AUTH_SECRET_FILE:-}");
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
