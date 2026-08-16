---
id: upgrading
title: Versioning & upgrading
---

# Versioning & upgrading

## The promise

moderato follows [semantic versioning](https://semver.org) from **1.0.0**
onward. The public API is the four entry points and everything this
[API reference](./api.md) lists.

| change | version |
| --- | --- |
| new export, new option with a default | **minor** — 1.1.0 |
| bug fix, doc fix, internal refactor | **patch** — 1.0.1 |
| removed or renamed export, changed signature | **major** — 2.0.0 |
| **a default that changes what gets published or refused** | **major** |

That last row is unusual and deliberate. Moving `blockScore` or adding a
category to `DEFAULT_ZERO_TOLERANCE` does not break anyone's build — it breaks
their *product*, silently, in the direction of refusing content that used to
publish. A moderation library that ships that in a patch is not trustworthy. It
gets a major, a changelog entry, and a row in the table below.

## Behaviour changes by version

| version | what changed | what to do |
| --- | --- | --- |
| 1.0.0 | first stable release | — |

## The rule: documentation cannot lag the code

Every upgrade updates the docs in the same pull request. This is not a
convention anybody has to remember — four things fail CI if it does not happen.

### 1. The docs import the real package

This site aliases `moderato` to `../dist` — the actual built output, the same
files npm ships. The [playground](./playground.mdx) and the
[metrics page](./rehearsal.mdx) run the library live. Rename an export and the
docs build fails, because a page is importing something that no longer exists.

### 2. Undocumented exports fail the build

```bash
npm run check:docs
```

It reads the built type declarations, lists every public export, and greps the
docs for each one. Add an export without documenting it and CI is red. It also
runs the other way: a `moderato` import in any code sample that does not resolve
to a real export is a stale doc, and fails too.

### 3. The version on the site is read from `package.json`

The docs cannot claim a version the package does not have — the banner, the
footer and the version dropdown all read the library's own manifest at build
time.

### 4. The metrics are regenerated, not written

`npm run rehearse` produces `docs/static/rehearsal/latest.json` and CI runs it.
If a policy change moves the numbers, the diff shows up in the same pull request
as the change. Nobody can update the code and leave a flattering old number on
the page.

## The release checklist

```bash
npm run typecheck
npm test
npm run build
npm run verify:package    # packs, unpacks, imports every entry point
npm run rehearse          # regenerate the metrics
npm run check:docs        # no undocumented or stale API
npm run docs:build        # the site builds against the real dist
```

Then, for a new version:

```bash
npm version minor
npm --prefix docs run version 1.1.0   # snapshot the docs for the old version
npm publish                            # prepublishOnly re-runs the first four
```

`prepublishOnly` runs typecheck, tests, build and package verification, so a
broken tarball cannot reach the registry even if somebody skips the checklist.

## Versioned documentation

Every published version keeps its own docs, reachable from the dropdown in the
navbar. A reader on 1.x is never shown 2.x's API — which is the single most
common way library documentation lies to people.

Snapshotting is one command and should happen **at release**, not before:

```bash
npm --prefix docs run version 1.0.0
```

That freezes the current pages under `docs/versioned_docs/version-1.0.0/`. Edits
after that go to the unreleased docs; a fix that applies to a released version
gets backported into its snapshot deliberately.

## Upgrading from 0.x

0.x was pre-release and had no stability promise. The two things that changed
behaviour on the way to 1.0:

**Automatic blocking above a confidence.** Previously the only automatic
refusals were zero-tolerance hits; everything else went to a human, which meant
a slur detected at 0.99 confidence merely opened a case while it stayed live.
The default policy now refuses at `score ≥ 0.92` in any category.

```ts
// to get the old behaviour back
createModerato({ provider, policy: { blockScore: Infinity } });
```

**`sexual` is documented as a choice.** It is still in
`DEFAULT_ZERO_TOLERANCE`, but `UNIVERSAL_ZERO_TOLERANCE` is now exported
separately and `POLICY_PRESETS.adult` builds on it. Nothing changes unless you
opt in. See [Policy](./policy.md).
