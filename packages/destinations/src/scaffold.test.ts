import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vite-plus/test";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageDirectory, "..", "..");
const scaffoldDirectory = path.join(packageDirectory, "src", "scaffold");
const guidePath = path.join(repoRoot, "docs", "contributing", "destination-adapter.md");
const scaffoldScriptPath = path.join(repoRoot, "scripts", "new-destination-adapter.mjs");

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "tocsin-scaffold-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("contributor guide", () => {
  it("quotes the scaffold files verbatim", () => {
    const guide = readFileSync(guidePath, "utf8");
    const quoted = [...guide.matchAll(/```ts file=(\S+)\n([\s\S]*?)```/g)].map((match) => ({
      file: match[1],
      code: match[2].trimEnd(),
    }));
    const templateFiles = readdirSync(scaffoldDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.relative(repoRoot, path.join(scaffoldDirectory, entry.name)))
      .sort();

    // Every scaffold file is quoted, and every quote is byte-identical to the
    // typechecked file it claims to show: a drifting guide fails here instead
    // of teaching code that no longer compiles.
    expect(quoted.map((block) => block.file).sort(compareStrings)).toEqual(templateFiles);

    for (const block of quoted) {
      expect(block.code, `${block.file} drifted from the guide`).toBe(
        readFileSync(path.join(repoRoot, block.file), "utf8").trimEnd(),
      );
    }
  });
});

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

describe("new-destination-adapter scaffold", () => {
  it("writes the renamed adapter files and prints the registration checklist", () => {
    const target = path.join(temporaryDirectory(), "mattermost-bot");
    const output = execFileSync(
      process.execPath,
      [scaffoldScriptPath, "mattermost_bot", "--out", target],
      { encoding: "utf8" },
    );

    expect(readdirSync(target).sort()).toEqual([
      "adapter.ts",
      "index.test.ts",
      "index.ts",
      "manifest.ts",
      "payload.ts",
      "schema.ts",
    ]);

    const manifest = readFileSync(path.join(target, "manifest.ts"), "utf8");

    expect(manifest).toContain('kind: "mattermost_bot"');
    expect(manifest).toContain('DestinationManifest<"mattermost_bot">');

    for (const file of readdirSync(target)) {
      const contents = readFileSync(path.join(target, file), "utf8");

      expect(contents.toLowerCase(), `${file} kept a placeholder token`).not.toContain("generic");
    }

    // The checklist has to name the sites a contributor cannot skip, including
    // the ones the typechecker does not catch.
    expect(output).toContain("DestinationKindSchema");
    expect(output).toContain("config-portability.ts");
    expect(output).toContain("destination-catalog.test.ts");
  });

  it("refuses to overwrite an existing adapter directory", () => {
    const target = path.join(temporaryDirectory(), "slack_webhook");

    execFileSync(process.execPath, [scaffoldScriptPath, "slack_webhook", "--out", target], {
      stdio: "pipe",
    });

    expect(() =>
      execFileSync(process.execPath, [scaffoldScriptPath, "slack_webhook", "--out", target], {
        stdio: "pipe",
      }),
    ).toThrow();
  });
});
