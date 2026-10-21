import { describe, expect, it } from "vite-plus/test";

import { requireBetterAuthBaseUrl, requireBetterAuthSecret } from "#/lib/auth-config";

describe("auth runtime config", () => {
  it("allows local development to rely on Better Auth defaults", () => {
    expect(requireBetterAuthBaseUrl(undefined, { NODE_ENV: "development" })).toBeUndefined();
    expect(requireBetterAuthSecret(undefined, { NODE_ENV: "development" })).toBeUndefined();
  });

  it("requires an explicit base URL and deployment-specific secret in production", () => {
    expect(() => requireBetterAuthBaseUrl(undefined, { NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_URL or SERVER_URL is required in production",
    );
    expect(() => requireBetterAuthSecret(undefined, { NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_SECRET is required in production",
    );
    expect(() => requireBetterAuthSecret("short", { NODE_ENV: "production" })).toThrow(
      "BETTER_AUTH_SECRET must be at least 32 characters in production",
    );
    expect(() =>
      requireBetterAuthSecret("change-me-to-at-least-32-characters", {
        NODE_ENV: "production",
      }),
    ).toThrow("BETTER_AUTH_SECRET must be replaced with a deployment-specific secret");
    expect(() =>
      requireBetterAuthSecret("better-auth-secret-12345678901234567890", {
        NODE_ENV: "production",
      }),
    ).toThrow("BETTER_AUTH_SECRET must be replaced with a deployment-specific secret");

    expect(
      requireBetterAuthBaseUrl("https://tocsin.example.test", { NODE_ENV: "production" }),
    ).toBe("https://tocsin.example.test");
    expect(
      requireBetterAuthSecret("0123456789abcdef0123456789abcdef", {
        NODE_ENV: "production",
      }),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  it("rejects secrets that were published in this repository", () => {
    const published = [
      // Historical docker-compose.yml fallback.
      "70c18d50d2b212c625494ffb8e5963878cb72447c2ff3a0f97fcfb793f90d444",
      // Historical apps/console/.env.example value.
      "47b719bff0508af756de6afba54ccd2deae022d1a6cb9d2c89f4f558dcd79ce2",
    ];

    for (const secret of published) {
      expect(() => requireBetterAuthSecret(secret, { NODE_ENV: "production" })).toThrow(
        "BETTER_AUTH_SECRET must be replaced with a deployment-specific secret",
      );
      // A case or whitespace variant must not slip past the denylist.
      expect(() =>
        requireBetterAuthSecret(`  ${secret.toUpperCase()}\n`, { NODE_ENV: "production" }),
      ).toThrow("BETTER_AUTH_SECRET must be replaced with a deployment-specific secret");
      // Local development may still use the example file.
      expect(requireBetterAuthSecret(secret, { NODE_ENV: "development" })).toBe(secret);
    }
  });

  it("uses dynamic base URL host allowlists when multiple public hosts are configured", () => {
    expect(
      requireBetterAuthBaseUrl(
        "https://tocsin.example.test",
        { NODE_ENV: "production" },
        {
          allowedHosts: ["localhost:6180", "tocsin.example.test", "*.preview.example.test"],
        },
      ),
    ).toEqual({
      allowedHosts: ["localhost:6180", "tocsin.example.test", "*.preview.example.test"],
      fallback: "https://tocsin.example.test",
      protocol: "auto",
    });

    expect(
      requireBetterAuthBaseUrl(
        undefined,
        { NODE_ENV: "development" },
        {
          allowedHosts: ["localhost:6180"],
        },
      ),
    ).toEqual({
      allowedHosts: ["localhost:6180"],
      fallback: undefined,
      protocol: "auto",
    });
  });
});
