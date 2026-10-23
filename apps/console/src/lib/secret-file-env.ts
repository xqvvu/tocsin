import "@tanstack/react-start/server-only";
import { readFileSync } from "node:fs";

/**
 * Environment variables whose value may be supplied through a sibling
 * `<NAME>_FILE` path instead of inline text.
 *
 * Only startup secrets belong here. An inline value always wins, so a
 * deployment that sets both keeps reading the environment variable and never
 * touches the filesystem.
 */
export const SECRET_FILE_ENV_VARS = ["BETTER_AUTH_SECRET"] as const;

export type SecretFileReader = (path: string) => string;

export interface ResolveSecretFileEnvOptions {
  env: Readonly<Record<string, string | undefined>>;
  /** Injectable for tests; defaults to reading the file as UTF-8. */
  readFile?: SecretFileReader;
  /** Upper bound for a secret file; defaults to 4 KiB. */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 4 * 1024;

/**
 * Files written by `docker secret` / Kubernetes secret mounts usually end with
 * a newline. Only trailing line breaks are stripped: leading and trailing
 * spaces are part of the secret.
 */
const TRAILING_NEWLINES = /(?:\r?\n)+$/;

/**
 * Resolves `<NAME>_FILE` indirection for the given secret environment
 * variables.
 *
 * Precedence: an inline `<NAME>` value wins; otherwise `<NAME>_FILE` is read.
 * A missing, unreadable, or empty file fails loudly instead of silently
 * falling back to a default, because a silently generated secret would
 * invalidate every existing session on restart.
 */
export function resolveSecretFileEnv(
  names: readonly string[],
  options: ResolveSecretFileEnvOptions,
): Record<string, string> {
  const { env, readFile = defaultReadFile, maxBytes = DEFAULT_MAX_BYTES } = options;
  const resolved: Record<string, string> = {};

  for (const name of names) {
    // A blank inline value counts as unset: compose forwards
    // `BETTER_AUTH_SECRET: "${BETTER_AUTH_SECRET:-}"`, which arrives as `""`.
    // Otherwise the empty fallback would shadow the file path forever.
    if (env[name]?.trim()) {
      continue;
    }

    const filePath = env[`${name}_FILE`]?.trim();

    if (!filePath) {
      continue;
    }

    resolved[name] = readSecretFile(name, filePath, readFile, maxBytes);
  }

  return resolved;
}

function readSecretFile(
  name: string,
  filePath: string,
  readFile: SecretFileReader,
  maxBytes: number,
): string {
  let contents: string;

  try {
    contents = readFile(filePath);
  } catch (error) {
    // Report the errno code, not the underlying message: the message may embed
    // the path, and no error path may ever carry file contents into logs.
    throw new Error(`Unable to read ${name}_FILE at ${filePath}: ${errorCode(error)}`);
  }

  if (Buffer.byteLength(contents, "utf8") > maxBytes) {
    throw new Error(`${name}_FILE at ${filePath} is larger than ${maxBytes} bytes`);
  }

  const value = contents.replace(TRAILING_NEWLINES, "");

  if (!value.trim()) {
    throw new Error(`${name}_FILE at ${filePath} is empty`);
  }

  // A single secret never spans lines. Rejecting the rest keeps a PEM file or
  // a `--from-env-file` blob from being accepted as a signing key, which would
  // otherwise fail later as an unexplained login error.
  if (/[\r\n]/.test(value)) {
    throw new Error(`${name}_FILE at ${filePath} must contain a single line`);
  }

  return value;
}

function defaultReadFile(path: string): string {
  return readFileSync(path, "utf8");
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "unknown error";
}
