import { describe, expect, it } from "vite-plus/test";

import { REDACTED_VALUE, isSensitiveKey, redactText } from "#core/redaction";

/**
 * A frozen copy of the pre-SEC-19 implementation, kept only as a differential
 * oracle. Do not wire this into runtime code and do not "fix" it when the live
 * key list changes: the oracle exists to prove that the linear scanner still
 * hides exactly what the backtracking pattern hid when it was replaced.
 */
const LEGACY_EXACT_KEYS = [
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "token",
  "tokens",
  "tokenhash",
  "secret",
  "password",
  "passwd",
  "passphrase",
  "passwordhash",
  "passwordconfirmation",
  "credential",
  "credentials",
  "apikey",
  "accesskey",
  "secretkey",
  "privatekey",
  "signingkey",
  "signingsecret",
  "signsecret",
  "webhookurl",
];

const LEGACY_SUFFIX_SOURCE =
  "secret|token|password|passwd|passphrase|credential|privatekey|apikey|authorization|cookie";

const LEGACY_TEXT_KEY_SOURCE = [
  ...LEGACY_EXACT_KEYS.map((key) => key.split("").join("[._-]?")),
  `[A-Za-z0-9._-]*(?:${LEGACY_SUFFIX_SOURCE})`,
].join("|");

const LEGACY_ASSIGNMENT_PATTERN = new RegExp(
  `(["']?)\\b(${LEGACY_TEXT_KEY_SOURCE})\\1(\\s*[:=]\\s*)(?:"((?:\\\\.|[^"\\\\])*)"(?=\\s*[,;}\\]\\n\\r]|$)|'((?:\\\\.|[^'\\\\])*)'(?=\\s*[,;}\\]\\n\\r]|$)|([^,;\\n\\r]*?)(?=\\s+["']?(?:${LEGACY_TEXT_KEY_SOURCE})["']?\\s*[:=]|[,;\\n\\r]|$))`,
  "gi",
);

const LEGACY_CREDENTIAL_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/(https?:\/\/hooks\.slack\.com\/services\/)[A-Za-z0-9/_-]+/gi, "$1[REDACTED]"],
  [
    /(https?:\/\/open\.(?:feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/)[A-Za-z0-9-]+/gi,
    "$1[REDACTED]",
  ],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, REDACTED_VALUE],
  [/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, "$1$2:[REDACTED]@"],
  [
    /\b(Bearer|Basic|Token)\s+((?=[A-Za-z0-9._~+/=-]{8,}(?![A-Za-z0-9._~+/=-]))(?=[A-Za-z0-9._~+/=-]*[0-9._~+/=-])[A-Za-z0-9._~+/=-]+)/gi,
    "$1 [REDACTED]",
  ],
];

function legacyQuotedFallback(value: string | undefined): string {
  const trimmed = (value ?? "").trimEnd();
  const quote = trimmed[0];

  return (quote === '"' || quote === "'") && trimmed.length > 1 && trimmed.endsWith(quote)
    ? quote
    : "";
}

function legacyRedactSensitiveAssignments(value: string): string {
  return value.replace(
    LEGACY_ASSIGNMENT_PATTERN,
    (
      match,
      quote: string,
      key: string,
      separator: string,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      unquotedValue: string | undefined,
    ) => {
      if (!isSensitiveKey(key)) return match;

      const quoteChar =
        doubleQuotedValue !== undefined
          ? '"'
          : singleQuotedValue !== undefined
            ? "'"
            : legacyQuotedFallback(unquotedValue);
      const redactedValue = quoteChar
        ? `${quoteChar}${REDACTED_VALUE}${quoteChar}`
        : REDACTED_VALUE;

      return `${quote}${key}${quote}${separator}${redactedValue}`;
    },
  );
}

function legacyRedactCredentialText(value: string): string {
  return LEGACY_CREDENTIAL_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

function legacyRedactText(value: string): string {
  return legacyRedactCredentialText(legacyRedactSensitiveAssignments(value));
}

/**
 * The live scanner must match the frozen oracle except for the one documented
 * divergence added by SEC-34: the frozen pattern requires a non-empty
 * username, so `redis://:secret@host` used to stay visible. This pass restates
 * that single rule on top of the oracle; any other drift still fails.
 */
function expectedRedactText(value: string): string {
  return legacyRedactText(value).replace(
    /\b([a-z][a-z0-9+.-]*:\/\/):([^\s/@]+)@/gi,
    `$1:${REDACTED_VALUE}@`,
  );
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 0x1_0000_0000;
  };
}

const KEYS = [
  "token",
  "tokens",
  "tokenHash",
  "token_hash",
  "token-hash",
  "accessToken",
  "appSecret",
  "app_secret",
  "clientSecret",
  "webhook_url",
  "webhook-url",
  "webhookUrl",
  "authorization",
  "X-Auth-Token",
  "password",
  "passwd",
  "privateKey",
  "credentials",
  "max_tokens",
  "tokenCount",
  "maxTokens",
  "privateKeyId",
  "title",
  "message",
  "severity",
  "foo",
  "x-token",
  "foo.token",
  "foo.webhook_url",
  ".token",
  "_token",
  "web__hookurl",
  "token__hash",
  "token_",
  `${"a".repeat(70)}token`,
  `${"a.".repeat(30)}secret`,
];

const VALUES = [
  "abc",
  "hunter2",
  "s3cr3t",
  "sk-live-123",
  "",
  " ",
  "a b",
  "a,b",
  "a;b",
  "a: b",
  "a=b",
  "a}b",
  "a]b",
  '"a"',
  "'a'",
  '"a b"',
  "'a,b'",
  '"a\\"b"',
  '"a\\\\b"',
  '"a\nb"',
  '"a\\\nb"',
  '"unterminated',
  "a\nb",
  "a\rb",
  "a b",
  "a b",
  "Bearer abcdef1234",
  "https://user:supersecret@example.test/hook",
  "https://hooks.slack.com/services/T000/B000/XXXX",
  "[REDACTED]",
];

const WHITESPACE = [" ", "  ", "\t", "\n", "\r", " \n", " ", " "];
const QUOTES = ["", '"', "'"];
const SEPARATORS = [":", "=", " : ", " = ", "=", ": ", "\n=\n"];

function buildStructuredInput(random: () => number): string {
  const parts: string[] = [];
  const segments = 1 + Math.floor(random() * 4);

  for (let segment = 0; segment < segments; segment += 1) {
    if (random() < 0.25) parts.push(["msg", "note", "headers", "text"][Math.floor(random() * 4)]);
    parts.push(QUOTES[Math.floor(random() * QUOTES.length)]);
    parts.push(KEYS[Math.floor(random() * KEYS.length)]);
    parts.push(QUOTES[Math.floor(random() * QUOTES.length)]);
    parts.push(SEPARATORS[Math.floor(random() * SEPARATORS.length)]);
    parts.push(VALUES[Math.floor(random() * VALUES.length)]);
    parts.push(WHITESPACE[Math.floor(random() * WHITESPACE.length)]);
  }

  return parts.join("");
}

const RANDOM_ALPHABET = [
  "a",
  "Z",
  "0",
  ".",
  "-",
  "_",
  "+",
  ":",
  "/",
  "=",
  ",",
  ";",
  "{",
  "}",
  "[",
  "]",
  '"',
  "'",
  "\\",
  " ",
  "\t",
  "\n",
  "\r",
  " ",
  "@",
  "token",
  "secret",
  "password",
  "://",
  "user:pass@",
  "Bearer ",
];

function buildRandomInput(random: () => number): string {
  const length = Math.floor(random() * 60);
  let value = "";

  for (let index = 0; index < length; index += 1) {
    value += RANDOM_ALPHABET[Math.floor(random() * RANDOM_ALPHABET.length)];
  }

  return value;
}

describe("redaction assignment scan", () => {
  it("keeps suffix keys with prefixes longer than the old bounded-quantifier proposal", () => {
    const prefix = "a".repeat(100);

    expect(redactText(`${prefix}token=supersecret`)).toBe(`${prefix}token=[REDACTED]`);
    expect(redactText(`${"a.".repeat(100)}token=supersecret`)).not.toContain("supersecret");
    expect(redactText(`${"a-".repeat(100)}password=supersecret`)).not.toContain("supersecret");
    expect(redactText(`${"client_"}${"x".repeat(80)}_secret=supersecret`)).not.toContain(
      "supersecret",
    );
  });

  it("keeps exact-key separator and boundary semantics", () => {
    expect(redactText("web__hookurl=visible token__hash=visible access__key=visible")).toBe(
      "web__hookurl=visible token__hash=visible access__key=visible",
    );
    expect(redactText("a__token=secret")).toBe("a__token=[REDACTED]");
    expect(redactText("mytoken=secret x-token=secret foo.token=secret")).toBe(
      "mytoken=[REDACTED] x-token=[REDACTED] foo.token=[REDACTED]",
    );
    expect(redactText("étoken=secret")).toBe("étoken=[REDACTED]");
    expect(redactText(`${"a".repeat(100)}webhook_url=visible`)).toBe(
      `${"a".repeat(100)}webhook_url=visible`,
    );
    expect(redactText("xwebhookurl=visible")).toBe("xwebhookurl=visible");
    expect(redactText("foo.webhook_url=secret")).toBe("foo.webhook_url=[REDACTED]");
  });

  it("keeps quoted-key semantics", () => {
    expect(redactText('"token" : "abc"')).toBe('"token" : "[REDACTED]"');
    expect(redactText("'token'='abc'")).toBe("'token'='[REDACTED]'");
    expect(redactText('"token: abc')).toBe('"token: [REDACTED]');
    expect(redactText('token": abc')).toBe('token": abc');
    expect(redactText('"foo.token": abc')).toBe('"foo.token": [REDACTED]');
    expect(redactText('"foo.webhook_url": abc')).toBe('"foo.webhook_url": abc');
    expect(redactText('".token": abc')).toBe('".token": abc');
    expect(redactText('"_token": abc')).toBe('"_token": [REDACTED]');
  });

  it("keeps separator whitespace and value-boundary semantics", () => {
    expect(redactText("token  =  abc")).toBe("token  =  [REDACTED]");
    expect(redactText("token\n=\nabc")).toBe("token\n=\n[REDACTED]");
    expect(redactText("token= password=def")).toBe("token= [REDACTED]");
    expect(redactText("token== token=abc")).toBe("token=[REDACTED] token=[REDACTED]");
    expect(redactText("token=abc}")).toBe("token=[REDACTED]");
    expect(redactText('{"token":123}')).toBe('{"token":[REDACTED]');
    expect(redactText("token=abc, rest")).toBe("token=[REDACTED], rest");
    expect(redactText("token=abc; rest")).toBe("token=[REDACTED]; rest");
    expect(redactText("token=abc\nrest")).toBe("token=[REDACTED]\nrest");
    expect(redactText("token=abc   ")).toBe("token=[REDACTED]");
    expect(redactText("token=")).toBe("token=[REDACTED]");
    expect(redactText("token=,x")).toBe("token=[REDACTED],x");
    expect(redactText("token=abc:def")).toBe("token=[REDACTED]");
  });

  it("keeps quoted-value and nested-assignment semantics", () => {
    expect(redactText('token="a\\"b"')).toBe('token="[REDACTED]"');
    expect(redactText('token="abc" password=def')).toBe('token="[REDACTED]" password=[REDACTED]');
    expect(redactText('token="abc"xyz')).toBe("token=[REDACTED]");
    expect(redactText('token="abc" ')).toBe('token="[REDACTED]"');
    expect(redactText('token="abc"\n')).toBe('token="[REDACTED]"\n');
    expect(redactText('token="abc" ,x')).toBe('token="[REDACTED]" ,x');
    expect(redactText("msg=token=abc")).toBe("msg=token=[REDACTED]");
    expect(redactText('note="token=abc" other="x"')).toBe('note="token=[REDACTED]');
  });

  it("keeps Unicode whitespace semantics", () => {
    expect(redactText("token\u00a0=\u00a0abc")).toBe("token\u00a0=\u00a0[REDACTED]");
    // U+2028 is whitespace to `\s` but not `\n`/`\r`, so it stays inside the
    // separator and terminates an unquoted value only through the lookahead.
    expect(redactText("token=\u2028abc")).toBe("token=\u2028[REDACTED]");
    expect(redactText("token=abc\u2028password=def")).toBe(
      "token=[REDACTED]\u2028password=[REDACTED]",
    );
  });

  it("keeps URL userinfo semantics", () => {
    expect(redactText("custom+scheme://u:p@h")).toBe("custom+scheme://u:[REDACTED]@h");
    expect(redactText("_https://u:p@h")).toBe("_https://u:p@h");
    expect(redactText("xhttps://u:p@h")).toBe("xhttps://u:[REDACTED]@h");
    expect(redactText("1https://u:p@h")).toBe("1https://u:p@h");
    expect(redactText("a.https://u:p@h")).toBe("a.https://u:[REDACTED]@h");
    expect(redactText("https://u:p@ss@h")).toBe("https://u:[REDACTED]@ss@h");
    // An empty username still carries the secret: connection strings such as
    // `redis://:hunter2@cache.local` put the whole credential in the password.
    expect(redactText("https://:pass@h")).toBe("https://:[REDACTED]@h");
    expect(redactText("redis://:hunter2@cache.local")).toBe("redis://:[REDACTED]@cache.local");
    expect(redactText("postgres://:hunter2@db.local")).toBe("postgres://:[REDACTED]@db.local");
    expect(redactText("postgresql://:hunter2@db.local/tocsin")).toBe(
      "postgresql://:[REDACTED]@db.local/tocsin",
    );
    expect(redactText("https://:8080/path")).toBe("https://:8080/path");
    expect(redactText("https://:@h")).toBe("https://:@h");
    expect(redactText("https://user:@h")).toBe("https://user:@h");
    expect(redactText("ssh://git@github.com")).toBe("ssh://git@github.com");
    expect(redactText("Basic https://u:p@h")).toBe("Basic https://u:[REDACTED]@h");
    expect(redactText("https://u :p@h")).toBe("https://u :p@h");
    expect(redactText("HTTPS://U:P@H")).toBe("HTTPS://U:[REDACTED]@H");
  });

  it("matches the frozen legacy implementation on structured inputs", () => {
    const random = createRandom(19_190_719);

    for (let index = 0; index < 5_000; index += 1) {
      const input = buildStructuredInput(random);
      expect(redactText(input), JSON.stringify(input)).toBe(expectedRedactText(input));
    }
  });

  it("matches the frozen legacy implementation on random inputs", () => {
    const random = createRandom(78_157_902);

    for (let index = 0; index < 5_000; index += 1) {
      const input = buildRandomInput(random);
      expect(redactText(input), JSON.stringify(input)).toBe(expectedRedactText(input));
    }
  });
});
