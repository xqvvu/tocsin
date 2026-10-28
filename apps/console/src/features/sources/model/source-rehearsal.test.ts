import { describe, expect, it } from "vite-plus/test";

import { parseRehearsalPayload } from "#/features/sources/model/source-rehearsal";

describe("source rehearsal payload parsing", () => {
  it("accepts a JSON object body", () => {
    expect(parseRehearsalPayload('{"title":"Checkout down"}')).toEqual({
      ok: true,
      value: { title: "Checkout down" },
    });
  });

  it("accepts non-object JSON so the provider decides what is unsupported", () => {
    expect(parseRehearsalPayload("[]")).toEqual({ ok: true, value: [] });
    expect(parseRehearsalPayload("null")).toEqual({ ok: true, value: null });
  });

  it("rejects empty and malformed bodies", () => {
    expect(parseRehearsalPayload("   ")).toEqual({ ok: false });
    expect(parseRehearsalPayload("{oops")).toEqual({ ok: false });
  });
});
