/**
 * A REHEARSAL — moderato practising against a labelled corpus before it
 * performs on real users.
 *
 * A moderation library's version number tells you nothing about whether it
 * still catches slurs. Tests tell you the code does what it did yesterday;
 * they cannot tell you whether 0.92 is the right place to put the line
 * between "refuse this" and "ask a human", because that is not a question
 * about code. It is a measurement, and it changes every time the corpus,
 * the vocabulary or the classifier changes.
 *
 * So: run every labelled case through the classifier ONCE, then replay the
 * policy over the results at every threshold in a sweep. One classifier
 * pass, fifty policy evaluations — because the thing being tuned is the
 * policy, and holding the classifier output fixed is what makes the sweep
 * a controlled experiment rather than fifty different experiments.
 *
 *   npm run rehearse            # wordlist provider: offline, free, CI-safe
 *   OPENAI_API_KEY=… npm run rehearse
 *
 * Writes `docs/static/rehearsal/latest.json` (the metrics page reads it)
 * and appends one line to `docs/static/rehearsal/history.jsonl` (the trend).
 */

import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  POLICY_PRESETS,
  createModerato,
  decide,
  httpProvider,
  openAIProvider,
  wordlistProvider,
  PROFANITY_PRESET,
} from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "static", "rehearsal");

const round = (n) => Math.round(n * 1000) / 1000;

/** Thresholds swept for `blockScore`. Finer than anyone tunes by hand. */
const SWEEP = Array.from({ length: 26 }, (_, i) => round(0.50 + i * 0.02));
/** The threshold the library actually ships with — the headline row. */
const SHIPPED = 0.92;

const ACTIONS = ["allow", "review", "block"];

// ── corpus ──

function loadCorpus() {
  const dir = join(root, "corpus");
  const cases = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const raw = readFileSync(join(dir, file), "utf8");
    raw.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        throw new Error(`${file}:${index + 1} is not valid JSON — ${err.message}`);
      }
      if (!ACTIONS.includes(parsed.expected)) {
        throw new Error(
          `${file}:${index + 1} (${parsed.id}) has expected="${parsed.expected}"; ` +
            `must be one of ${ACTIONS.join(", ")}`,
        );
      }
      cases.push({ ...parsed, file });
    });
  }
  if (cases.length === 0) throw new Error("corpus is empty — nothing to rehearse");
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate case id: ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

// ── the classifier pass ──

function buildProvider() {
  const wordlist = wordlistProvider(PROFANITY_PRESET);
  if (process.env.MODERATO_SCREEN_URL) {
    return {
      name: "http",
      provider: httpProvider({ url: process.env.MODERATO_SCREEN_URL }),
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "wordlist+openai",
      provider: [
        wordlist,
        openAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
      ],
    };
  }
  return { name: "wordlist", provider: wordlist };
}

/**
 * Classify every case once, keeping the raw scores. `screenDetailed` exists
 * for exactly this: the verdict is a function of (result, policy), and we
 * want to vary only the second half.
 */
async function classifyAll(cases) {
  const { name, provider } = buildProvider();
  const engine = createModerato({ provider, cache: false });
  const results = [];
  for (const item of cases) {
    const { result } = await engine.screenDetailed({ text: item.text });
    results.push({ ...item, result: result ?? { flags: {}, scores: {} } });
  }
  return { provider: name, results };
}

// ── scoring ──

/**
 * The policy for a case, at a given block threshold. Identity surfaces are
 * judged by the identity preset — scoring a handle against the comment
 * policy would measure a policy nobody runs.
 */
function policyFor(surface, blockScore) {
  if (surface === "identity") return { ...POLICY_PRESETS.identity };
  return { ...POLICY_PRESETS.balanced, blockScore };
}

function evaluate(results, blockScore) {
  let correct = 0;
  // "block" is the positive class: the auto-refuse decision is the one with
  // an asymmetric cost, and precision on it is the number that says how
  // often we silently deleted somebody's real post.
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const counts = { allow: 0, review: 0, block: 0 };
  const failures = [];

  for (const item of results) {
    const verdict = decide(item.result, policyFor(item.surface, blockScore));
    const actual = item.text.trim() ? verdict.action : "allow";
    counts[actual] += 1;
    if (actual === item.expected) correct += 1;
    else {
      failures.push({
        id: item.id,
        text: item.text.slice(0, 120),
        expected: item.expected,
        actual,
        score: round(verdict.score),
        categories: verdict.categories,
        tags: item.tags ?? [],
        note: item.note ?? null,
      });
    }
    if (actual === "block" && item.expected === "block") tp += 1;
    if (actual === "block" && item.expected !== "block") fp += 1;
    if (actual !== "block" && item.expected === "block") fn += 1;
  }

  const total = results.length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return {
    threshold: round(blockScore),
    precision: round(precision),
    recall: round(recall),
    f1: round(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
    accuracy: round(correct / total),
    // What this costs the humans: the share of everything posted that lands
    // in a queue someone has to read.
    queueRate: round(counts.review / total),
    blockRate: round(counts.block / total),
    // The share decided without a person — the automation this all exists for.
    autoHandled: round((counts.allow + counts.block) / total),
    counts: { ...counts },
    confusion: { tp, fp, fn },
    failures,
  };
}

/** Per-tag accuracy at the shipped threshold — which KINDS of case we miss. */
function byTag(results, blockScore) {
  const tally = new Map();
  for (const item of results) {
    const verdict = decide(item.result, policyFor(item.surface, blockScore));
    const actual = item.text.trim() ? verdict.action : "allow";
    for (const tag of item.tags ?? ["untagged"]) {
      const row = tally.get(tag) ?? { tag, total: 0, correct: 0 };
      row.total += 1;
      if (actual === item.expected) row.correct += 1;
      tally.set(tag, row);
    }
  }
  return [...tally.values()]
    .map((row) => ({ ...row, accuracy: round(row.correct / row.total) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
}

// ── run ──

const cases = loadCorpus();
const { provider, results } = await classifyAll(cases);

const sweep = SWEEP.map((t) => {
  const { failures, ...rest } = evaluate(results, t);
  return rest;
});
const headline = evaluate(results, SHIPPED);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const byExpected = { allow: 0, review: 0, block: 0 };
const bySource = {};
for (const item of cases) {
  byExpected[item.expected] += 1;
  bySource[item.source ?? "unknown"] = (bySource[item.source ?? "unknown"] ?? 0) + 1;
}

const report = {
  version: pkg.version,
  // Passed in so the run is reproducible; a wall-clock read here would make
  // every rehearsal a different experiment.
  generatedAt: process.env.REHEARSAL_AT ?? new Date().toISOString(),
  provider,
  shippedThreshold: SHIPPED,
  corpus: { cases: cases.length, byExpected, bySource },
  headline: { ...headline, failures: undefined },
  sweep,
  byTag: byTag(results, SHIPPED),
  failures: headline.failures,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
appendFileSync(
  join(outDir, "history.jsonl"),
  `${JSON.stringify({
    at: report.generatedAt,
    version: report.version,
    provider,
    cases: cases.length,
    precision: headline.precision,
    recall: headline.recall,
    f1: headline.f1,
    accuracy: headline.accuracy,
    autoHandled: headline.autoHandled,
  })}\n`,
);

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log(`\nrehearsal · moderato@${report.version} · provider: ${provider}`);
console.log(`  corpus      ${cases.length} cases`);
console.log(`  precision   ${pct(headline.precision)}  (of what we refused, how much deserved it)`);
console.log(`  recall      ${pct(headline.recall)}  (of what deserved refusing, how much we caught)`);
console.log(`  accuracy    ${pct(headline.accuracy)}  (exact allow/review/block match)`);
console.log(`  auto-handled${pct(headline.autoHandled).padStart(7)}  (decided without a human)`);
if (headline.failures.length) {
  console.log(`\n  ${headline.failures.length} case(s) the shipped policy gets wrong:`);
  for (const f of headline.failures.slice(0, 12)) {
    console.log(`    · ${f.expected} → ${f.actual}  "${f.text}"`);
  }
  if (headline.failures.length > 12) {
    console.log(`    … and ${headline.failures.length - 12} more (see latest.json)`);
  }
}
console.log(`\n  → docs/static/rehearsal/latest.json\n`);
