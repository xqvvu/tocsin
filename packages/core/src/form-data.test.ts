import { describe, expect, it } from "vite-plus/test";

import {
  formHeaderLines,
  formSeparatedList,
  formString,
  formTrimmedString,
  nonEmptyObject,
  type FormDataReader,
} from "#core/form-data";

describe("form data helpers", () => {
  it("reads strings without depending on DOM FormData types", () => {
    const data = reader({
      name: " Tocsin ",
      file: new Blob(),
    });

    expect(formString(data, "name")).toBe(" Tocsin ");
    expect(formTrimmedString(data, "name")).toBe("Tocsin");
    expect(formString(data, "file")).toBe("");
    expect(formString(data, "missing")).toBe("");
  });

  it("splits comma and newline separated values", () => {
    const data = reader({
      recipients: "sre@example.test, audit@example.test\n\nops@example.test",
    });

    expect(formSeparatedList(data, "recipients")).toEqual([
      "sre@example.test",
      "audit@example.test",
      "ops@example.test",
    ]);
  });

  it("parses header lines and ignores malformed or empty entries", () => {
    const data = reader({
      headers: "Authorization: Bearer token\ninvalid\nX-Team: sre\nX-Empty: ",
    });

    expect(formHeaderLines(data)).toEqual({
      Authorization: "Bearer token",
      "X-Team": "sre",
    });
  });

  it("returns undefined for objects without meaningful values", () => {
    expect(nonEmptyObject({ empty: "", list: [], nested: {} })).toBeUndefined();
    expect(nonEmptyObject({ value: "ok", omitted: "" })).toEqual({ value: "ok" });
  });
});

function reader(values: Record<string, unknown>): FormDataReader {
  return {
    get: (name) => values[name] ?? null,
  };
}
