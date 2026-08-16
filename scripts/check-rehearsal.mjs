/**
 * Is the committed rehearsal report still the truth?
 *
 * The report on the docs site is a claim about the version that ships. If a
 * policy or the corpus changes and nobody regenerates it, the site keeps
 * quoting a number for a library that no longer exists. So CI regenerates it
 * and compares.
 *
 * Everything is compared EXCEPT `generatedAt`. A wall clock is not a metric,
 * and comparing it means the check fails on every single run for a reason
 * that has nothing to do with whether the numbers moved — which is how a
 * guard gets switched off.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILE = "docs/static/rehearsal/latest.json";

/** The report, with the one field that legitimately changes every run gone. */
const metrics = (json) => {
  const { generatedAt, ...rest } = JSON.parse(json);
  return JSON.stringify(rest, null, 2);
};

let committed;
try {
  committed = metrics(
    execFileSync("git", ["show", `HEAD:${FILE}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch {
  // No git, no HEAD, or the file is not committed yet. There is nothing to
  // compare against, and inventing a failure here would only teach people to
  // pass --ignore-scripts.
  console.log(`\n· ${FILE} has no committed version to compare against — skipped\n`);
  process.exit(0);
}
const fresh = metrics(readFileSync(FILE, "utf8"));

if (committed === fresh) {
  console.log(`\n✓ ${FILE} matches a fresh run\n`);
  process.exit(0);
}

console.error(`::error::${FILE} is stale.`);
console.error("The policy or the corpus changed without regenerating the report.");
console.error("Run: npm run build && npm run rehearse — then commit the result.\n");

// Show the fields that actually differ, rather than a whole-file diff nobody
// reads. Two levels is enough: the report is metrics grouped by section.
const a = JSON.parse(committed);
const b = JSON.parse(fresh);
for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const before = JSON.stringify(a[key]);
  const after = JSON.stringify(b[key]);
  if (before === after) continue;
  console.error(`  ${key}`);
  console.error(`    committed: ${(before ?? "(absent)").slice(0, 300)}`);
  console.error(`    fresh:     ${(after ?? "(absent)").slice(0, 300)}`);
}
process.exit(1);
