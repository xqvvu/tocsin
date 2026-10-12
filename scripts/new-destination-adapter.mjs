#!/usr/bin/env node
/**
 * Scaffolds a destination adapter directory from the reference adapter in
 * `packages/destinations/src/scaffold/`.
 *
 * Usage: node scripts/new-destination-adapter.mjs <kind> [--out <directory>]
 *
 * The reference files are real, typechecked, tested adapter modules, so this
 * script only renames the `generic-webhook` token family to the new kind. It
 * deliberately does not edit registration points: a new `DestinationKind` must
 * be added to the core enum by hand (the guide lists every site, with the ones
 * that fail silently called out).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = path.join(repoRoot, "packages", "destinations", "src", "scaffold");
const defaultTargetRoot = path.join(repoRoot, "packages", "destinations", "src");

const [kind, ...rest] = process.argv.slice(2);
const outFlag = rest.indexOf("--out");
const outDirectory = outFlag === -1 ? undefined : rest[outFlag + 1];

if (!kind || !/^[a-z][a-z0-9_]*$/.test(kind) || kind === "scaffold") {
  fail(
    "Usage: node scripts/new-destination-adapter.mjs <kind> [--out <directory>]\n" +
      "<kind> must be lower_snake_case (the shape `DestinationKindSchema` accepts).",
  );
}

if (outFlag !== -1 && !outDirectory) {
  fail("--out needs a directory argument.");
}

const kebab = kind.replaceAll("_", "-");
const camel = kebab.replaceAll(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
const pascal = `${camel[0].toUpperCase()}${camel.slice(1)}`;
const screaming = kind.toUpperCase();
const words = kind
  .split("_")
  .map((word, index) => (index === 0 ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
  .join(" ");

const replacements = [
  ["Generic webhook", words],
  ["generic webhook", words.toLowerCase()],
  ["GenericWebhook", pascal],
  ["genericWebhook", camel],
  ["generic-webhook", kebab],
  ["generic_webhook", kind],
  ["GENERIC_WEBHOOK", screaming],
];

const targetDirectory = path.resolve(outDirectory ?? path.join(defaultTargetRoot, kebab));

if (existsSync(targetDirectory)) {
  fail(`Refusing to overwrite ${path.relative(repoRoot, targetDirectory)} (already exists).`);
}

const templateFiles = readdirSync(templateDir)
  .filter((file) => file.endsWith(".ts"))
  .sort();

mkdirSync(targetDirectory, { recursive: true });

for (const file of templateFiles) {
  const template = readFileSync(path.join(templateDir, file), "utf8");
  let generated = template;

  for (const [token, replacement] of replacements) {
    generated = generated.replaceAll(token, replacement);
  }

  writeFileSync(path.join(targetDirectory, file), generated);
}

const written = templateFiles.map((file) =>
  path.relative(repoRoot, path.join(targetDirectory, file)),
);

console.log(`Scaffolded ${written.length} files for destination kind "${kind}":\n`);
for (const file of written) {
  console.log(`  ${file}`);
}

console.log(`
Next steps - a new kind is not wired until every fail-loud site below is
handled. Read docs/contributing/destination-adapter.md for the full checklist:

  1. packages/core/src/destination/destination.ts
     Add "${kind}" to DestinationKindSchema. FAIL-LOUD: nothing below compiles first.
  2. packages/destinations/src/registry.ts
     Register the adapter in createDefaultDestinationRegistry. FAIL-LOUD (registry test).
  3. packages/destinations/package.json
     Add "./${kebab}": "./src/${kebab}/index.ts" to exports (silent otherwise).
  4. apps/console/src/i18n/messages/{en-US,zh-Hans}.json
     Add every message key the manifest references. FAIL-LOUD
     (apps/console/src/i18n/destination-catalog.test.ts).
  5. apps/console/src/features/destinations/model/destination-form.ts
     Extend DestinationFormKind and the form -> config mapping branches. FAIL-LOUD.
  6. apps/console/src/features/destinations/ui/destination-form.tsx
     Add the kind option and its field blocks. SILENT: manifest configFields do not
     render the form yet (see F3 in docs/prd/adapter-contribution-experience.md).
  7. apps/console/src/infra/sqlite/repositories/destination/destination.helpers.ts
     Extend the operational config, metadata and secret path switches. FAIL-LOUD.
  8. apps/console/src/server/configuration/config-portability.ts
     Extend destinationKindSecretPaths. FAIL-LOUD; a miss would leak secrets on export.
  9. apps/console/src/features/destinations/ui/feishu-dynamic-properties-field.tsx
     Extend BindingSelectorCases["destination.kind"] (silent otherwise).
 10. Icon: reuse an existing iconName, or add <icon>.svg to
     packages/destinations/assets/destination-icons/ plus an entry in
     packages/destinations/src/icons.ts (unknown names fall back to a generic glyph).

Then run: vp -C packages/destinations test run && vp check && vp run -r test
`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
