const BYTE_UNITS = ["B", "KiB", "MiB", "GiB"] as const;

/**
 * Compact binary-size label for operator-facing fact grids.
 *
 * Whole values stay integral (`1 MiB`), while fractional sizes keep one
 * decimal (`1.5 KiB`) so a multi-gigabyte database does not lose its order of
 * magnitude.
 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 || Number.isInteger(value) || value >= 100 ? 0 : 1;

  return `${value.toFixed(digits)} ${BYTE_UNITS[unitIndex]}`;
}
