/**
 * Prove the thing we are about to publish actually resolves.
 *
 * The failure this exists to catch: everything in this repo is TypeScript
 * source, and everything we ship is `dist`. Nothing in `npm test` or
 * `tsc --noEmit` touches the boundary between them — a missing `files`
 * entry, an `exports` path that points at a file tsup does not emit, a
 * `types` condition in the wrong order. All of them pass CI and all of
 * them are discovered by the first stranger to run `npm install moderato`,
 * and there is no undo on a published version.
 *
 * So: pack the tarball, unpack it somewhere clean, and import every entry
 * point the way a real consumer would — ESM and CJS, types and runtime.
 *
 * Run it yourself with `npm run verify:package`; `prepublishOnly` runs it
 * for you.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const stage = mkdtempSync(join(tmpdir(), "moderato-verify-"));

/** Entry points, and one export we expect each to carry. */
const ENTRIES = [
  ["moderato", "createModerato"],
  ["moderato/react", "useModeratedField"],
  ["moderato/web", "ModeratedUpload"],
  ["moderato/server", "createModerationHandler"],
];

const fail = (message) => {
  console.error(`\n✗ ${message}\n`);
  rmSync(stage, { recursive: true, force: true });
  process.exit(1);
};

try {
  console.log("· packing…");
  // --ignore-scripts so prepublishOnly (which calls this script) cannot
  // call itself back. Output is NOT parsed as JSON: lifecycle scripts write
  // to the same stream, and one line of tsup banner would break it.
  execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", stage], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  const packedName = readdirSync(stage).find((name) => name.endsWith(".tgz"));
  if (!packedName) fail("npm pack produced no tarball");
  const tarball = join(stage, packedName);

  const home = join(stage, "consumer");
  execFileSync("mkdir", ["-p", join(home, "node_modules")]);
  execFileSync("tar", ["-xzf", tarball, "-C", stage]);
  execFileSync("mv", [join(stage, "package"), join(home, "node_modules", "moderato")]);
  // A consumer's node_modules also holds react (an optional peer). Link the
  // one we already installed rather than fetching it again.
  execFileSync("ln", [
    "-s",
    join(root, "node_modules", "react"),
    join(home, "node_modules", "react"),
  ]);

  const manifest = JSON.parse(
    readFileSync(join(home, "node_modules", "moderato", "package.json"), "utf8"),
  );

  // 1. The published manifest must not point at TypeScript source.
  const asText = JSON.stringify(manifest.exports ?? {});
  // `.d.ts` is a declaration and belongs here; a bare `.ts`/`.tsx` is source.
  if (asText.includes("/src/") || /(?<!\.d)\.tsx?"/.test(asText)) {
    fail(
      `the packed package.json exports TypeScript source:\n  ${asText}\n` +
        `Consumers install the tarball, which contains only "files" — and ` +
        `src is not in it.`,
    );
  }

  // 2. Every entry point resolves and carries what it advertises.
  const require = createRequire(join(home, "index.cjs"));
  for (const [specifier, symbol] of ENTRIES) {
    let esm;
    try {
      const path = require.resolve(specifier, { paths: [home] });
      esm = await import(pathToFileURL(path).href);
    } catch (err) {
      fail(`import("${specifier}") failed: ${err.message}`);
    }
    if (!(symbol in esm)) {
      fail(`"${specifier}" resolved but does not export ${symbol}`);
    }
    console.log(`· ${specifier} → ${symbol} ✓`);
  }

  // 3. Types ship for every entry point.
  for (const [specifier] of ENTRIES) {
    const key = specifier === "moderato" ? "." : specifier.replace("moderato", ".");
    const types = manifest.exports?.[key]?.types;
    if (!types) fail(`"${specifier}" has no types entry in the published exports`);
    try {
      readFileSync(join(home, "node_modules", "moderato", types), "utf8");
    } catch {
      fail(`"${specifier}" points types at ${types}, which is not in the tarball`);
    }
  }

  // 4. Zero runtime dependencies — the whole reason this is safe to put in
  //    every app on the team.
  const deps = Object.keys(manifest.dependencies ?? {});
  if (deps.length > 0) {
    fail(`moderato ships with no runtime dependencies; found: ${deps.join(", ")}`);
  }

  const size = (statSync(tarball).size / 1024).toFixed(1);
  console.log(`\n✓ moderato@${manifest.version} verified (${size} kB packed)\n`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
