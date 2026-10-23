import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resolveSecretFileEnv, SECRET_FILE_ENV_VARS } from "#/lib/secret-file-env";

const NAME = "BETTER_AUTH_SECRET";
const FILE_NAME = `${NAME}_FILE`;

describe("secret file env", () => {
  it("covers the startup secret", () => {
    expect(SECRET_FILE_ENV_VARS).toContain(NAME);
  });

  it("reads the file when only the _FILE variable is set", () => {
    const readFile = vi.fn().mockReturnValue("from-file\n");

    expect(
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile,
      }),
    ).toEqual({ [NAME]: "from-file" });
    expect(readFile).toHaveBeenCalledWith("/run/secrets/better_auth_secret");
  });

  it("falls back to the file when compose forwards an empty inline value", () => {
    // `BETTER_AUTH_SECRET: "${BETTER_AUTH_SECRET:-}"` arrives as an empty
    // string; it must not shadow the file path.
    expect(
      resolveSecretFileEnv([NAME], {
        env: { [NAME]: "", [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile: () => "from-file",
      }),
    ).toEqual({ [NAME]: "from-file" });
  });

  it("treats a whitespace-only file path as unset", () => {
    const readFile = vi.fn();

    expect(
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "   " },
        readFile,
      }),
    ).toEqual({});
    expect(readFile).not.toHaveBeenCalled();
  });

  it("prefers an inline value and never touches the filesystem", () => {
    const readFile = vi.fn();

    expect(
      resolveSecretFileEnv([NAME], {
        env: { [NAME]: "inline", [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile,
      }),
    ).toEqual({});
    expect(readFile).not.toHaveBeenCalled();
  });

  it("ignores the indirection when neither variable is set", () => {
    expect(resolveSecretFileEnv([NAME], { env: {}, readFile: vi.fn() })).toEqual({});
  });

  it("strips trailing line breaks but keeps spaces inside the secret", () => {
    expect(
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile: () => "  padded secret  \r\n\r\n",
      }),
    ).toEqual({ [NAME]: "  padded secret  " });
  });

  it("fails startup when the file is empty", () => {
    expect(() =>
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile: () => "\n\n",
      }),
    ).toThrow(`${FILE_NAME} at /run/secrets/better_auth_secret is empty`);
  });

  it("rejects a file that still contains a line break", () => {
    expect(() =>
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile: () => "first line\nsecond line\n",
      }),
    ).toThrow(`${FILE_NAME} at /run/secrets/better_auth_secret must contain a single line`);
  });

  it("rejects a file larger than the cap", () => {
    expect(() =>
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile: () => "x".repeat(20),
        maxBytes: 10,
      }),
    ).toThrow(`${FILE_NAME} at /run/secrets/better_auth_secret is larger than 10 bytes`);
  });

  it("reports the variable, path, and errno without leaking contents", () => {
    const error = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
    });

    expect(() =>
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/missing" },
        readFile: () => {
          throw error;
        },
      }),
    ).toThrow(`Unable to read ${FILE_NAME} at /run/secrets/missing: ENOENT`);
  });

  it("never includes file contents or reader messages in the error", () => {
    const sentinel = "sentinel-secret-value";
    let message = "";

    try {
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/better_auth_secret" },
        readFile: () => {
          throw new Error(`failed while reading ${sentinel}`);
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(`Unable to read ${FILE_NAME}`);
    expect(message).not.toContain(sentinel);
  });

  it("does not treat an arbitrary error as an errno code", () => {
    expect(() =>
      resolveSecretFileEnv([NAME], {
        env: { [FILE_NAME]: "/run/secrets/broken" },
        readFile: () => {
          // An Error without an errno `code` still reports a stable message.
          throw new TypeError("no errno here");
        },
      }),
    ).toThrow(`Unable to read ${FILE_NAME} at /run/secrets/broken: unknown error`);
  });
});

describe("env runtime wiring", () => {
  const created: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    for (const directory of created.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("injects a file-supplied BETTER_AUTH_SECRET into the parsed env", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tocsin-secret-file-"));
    created.push(directory);
    const secretPath = join(directory, "better-auth-secret");
    writeFileSync(secretPath, "file-supplied-secret-value-1234567890\n");

    vi.stubEnv(NAME, "");
    vi.stubEnv(FILE_NAME, secretPath);
    vi.resetModules();

    const { env } = await import("#/env");

    expect(env.BETTER_AUTH_SECRET).toBe("file-supplied-secret-value-1234567890");
    // The file value is merged into the parsed env only; it must not be
    // written back to `process.env` where child processes could read it.
    expect(process.env[NAME]).toBe("");
  });

  it("keeps an inline value when a file is also configured", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tocsin-secret-inline-"));
    created.push(directory);
    const secretPath = join(directory, "better-auth-secret");
    writeFileSync(secretPath, "file-supplied-secret-value-1234567890\n");

    vi.stubEnv(NAME, "inline-secret-value-1234567890abcdef");
    vi.stubEnv(FILE_NAME, secretPath);
    vi.resetModules();

    const { env } = await import("#/env");

    expect(env.BETTER_AUTH_SECRET).toBe("inline-secret-value-1234567890abcdef");
    expect(process.env[NAME]).toBe("inline-secret-value-1234567890abcdef");
  });
});
