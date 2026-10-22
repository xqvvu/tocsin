import { describe, expect, it } from "vite-plus/test";

import { formatBytes } from "#/features/configuration/model/format-bytes";

describe("formatBytes", () => {
  it("keeps exact binary units integral", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KiB");
    expect(formatBytes(1024 * 1024)).toBe("1 MiB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3 GiB");
  });

  it("keeps one decimal for fractional sizes below 100 units", () => {
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(1.25 * 1024 * 1024)).toBe("1.3 MiB");
  });

  it("drops fractions once the value is large enough to lose meaning", () => {
    expect(formatBytes(118 * 1024 * 1024)).toBe("118 MiB");
  });
});
