/**
 * The anti-drift guard.
 *
 * "Keep the docs up to date" is a rule nobody has ever kept by remembering.
 * It gets kept by failing the build, so this is the build failing:
 *
 *   1. every public export is mentioned somewhere in the docs — you cannot
 *      add API without documenting it;
 *   2. every `moderato` symbol the docs import actually exists — you cannot
 *      rename or delete API and leave the old name on a page;
 *   3. the docs site reads its version from the library's package.json, so
 *      it cannot advertise a version that was never published.
 *
 * (1) catches new things going undocumented. (2) catches old things going
 * stale, which is the failure that actually hurts — a reader following a
 * page that describes a function removed two releases ago.
 *
 *   npm run check:docs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs", "docs");
const distDir = join(root, "dist");

/** Names that are real exports but would be noise on a docs page. */
const NOT_REQUIRED_IN_DOCS = new Set([
  // Type aliases that only ever appear as part of another signature.
  "NormalizedInput",
  "ImagePart",
  "CategoryThresholds",
  "MutationCallbacks",
  "SubmitTarget",
  "FrameEnv",
  "ModerationRequestBody",
  "ModerationResponseBody",
]);

const problems = [];
const fail = (message) => problems.push(message);

// ── the docs corpus ──

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if ([".md", ".mdx"].includes(extname(entry))) out.push(full);
  }
  return out;
}

const docFiles = walk(docsDir);
const docText = docFiles.map((f) => readFileSync(f, "utf8")).join("\n");
if (docFiles.length === 0) fail("no documentation pages found at docs/docs");

// ── 1. every export is documented ──

/** Public export names, read from the built declarations — the same thing a
 *  consumer's editor sees, rather than a hand-kept list. */
function exportsOf(declaration) {
  const source = readFileSync(declaration, "utf8");
  const names = new Set();
  // `export { a, b as c, type D }` — the shape tsup's .d.ts rollup emits.
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of block[1].split(",")) {
      const cleaned = part.trim().replace(/^type\s+/, "");
      if (!cleaned) continue;
      const name = (cleaned.includes(" as ") ? cleaned.split(" as ")[1] : cleaned).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // `export declare const x` / `export declare function y` / `export interface Z`
  for (const m of source.matchAll(
    /export\s+(?:declare\s+)?(?:const|function|class|interface|type|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(m[1]);
  }
  return names;
}

const ENTRIES = [
  ["moderato", join(distDir, "index.d.ts")],
  ["moderato/react", join(distDir, "react", "index.d.ts")],
  ["moderato/web", join(distDir, "web", "index.d.ts")],
  ["moderato/server", join(distDir, "server", "index.d.ts")],
];

const allExports = new Set();
for (const [specifier, declaration] of ENTRIES) {
  let names;
  try {
    names = exportsOf(declaration);
  } catch {
    fail(
      `cannot read ${declaration} — run \`npm run build\` before \`npm run check:docs\``,
    );
    continue;
  }
  if (names.size === 0) fail(`found no exports in ${declaration}; the parser may be stale`);
  for (const name of names) allExports.add(name);

  const undocumented = [...names]
    .filter((name) => !NOT_REQUIRED_IN_DOCS.has(name))
    // Word-boundary match so `decide` does not match "decided".
    .filter((name) => !new RegExp(`\\b${name}\\b`).test(docText));

  if (undocumented.length > 0) {
    fail(
      `${specifier} exports ${undocumented.length} name(s) no page mentions:\n` +
        undocumented.map((n) => `      · ${n}`).join("\n") +
        `\n      Document them (docs/docs/api.md at minimum), or add them to ` +
        `NOT_REQUIRED_IN_DOCS in scripts/check-docs.mjs with a reason.`,
    );
  }
}

// ── 2. everything the docs import exists ──

for (const file of docFiles) {
  const source = readFileSync(file, "utf8");
  const relative = file.slice(root.length + 1);
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["'](moderato(?:\/[a-z]+)?)["']/g,
  )) {
    for (const part of match[1].split(",")) {
      const cleaned = part.trim().replace(/^type\s+/, "");
      if (!cleaned) continue;
      const name = cleaned.split(/\s+as\s+/)[0].trim();
      if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      if (!allExports.has(name)) {
        fail(
          `${relative} imports \`${name}\` from "${match[2]}", but nothing by that ` +
            `name is exported. The docs are describing an API that does not exist.`,
        );
      }
    }
  }
}

// ── 3. the site cannot invent a version ──

const config = readFileSync(join(root, "docs", "docusaurus.config.ts"), "utf8");
if (!config.includes('readFileSync(resolve(__dirname, "..", "package.json")')) {
  fail(
    "docs/docusaurus.config.ts no longer reads the library's package.json — the " +
      "version shown on the site could drift from the one published.",
  );
}

// ── report ──

if (problems.length > 0) {
  console.error(`\n✗ documentation is out of step with the code:\n`);
  for (const problem of problems) console.error(`  · ${problem}\n`);
  process.exit(1);
}

console.log(
  `\n✓ docs check passed — ${allExports.size} public exports, ` +
    `${docFiles.length} pages, no drift\n`,
);
