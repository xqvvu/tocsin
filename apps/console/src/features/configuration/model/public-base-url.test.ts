import { describe, expect, it } from "vite-plus/test";

import { classifyPublicBaseUrl } from "#/features/configuration/model/public-base-url";

describe("classifyPublicBaseUrl", () => {
  it("treats a missing or blank base URL as missing", () => {
    expect(classifyPublicBaseUrl(null)).toBe("missing");
    expect(classifyPublicBaseUrl("")).toBe("missing");
    expect(classifyPublicBaseUrl("   ")).toBe("missing");
  });

  it("recognizes the Compose default and other host-only origins as local", () => {
    expect(classifyPublicBaseUrl("http://localhost:3000")).toBe("local");
    expect(classifyPublicBaseUrl("https://tocsin.localhost")).toBe("local");
    expect(classifyPublicBaseUrl("http://127.0.0.1:3000")).toBe("local");
    expect(classifyPublicBaseUrl("http://127.8.9.10")).toBe("local");
    expect(classifyPublicBaseUrl("http://[::1]:3000")).toBe("local");
    expect(classifyPublicBaseUrl("http://0.0.0.0:3000")).toBe("local");
  });

  it("accepts a public origin and ignores surrounding whitespace", () => {
    expect(classifyPublicBaseUrl(" https://tocsin.example.com ")).toBe("public");
    expect(classifyPublicBaseUrl("http://10.0.0.5:3000")).toBe("public");
  });

  it("falls back to missing when the value is not an absolute URL", () => {
    expect(classifyPublicBaseUrl("tocsin.example.com")).toBe("missing");
  });
});
