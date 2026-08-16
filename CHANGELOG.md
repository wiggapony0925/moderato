# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`defineModeration()`** — the front door. One config object in product
  terms (`tolerance`, `audience`, `rules`, `allow`, `deny`, `personalData`,
  `surfaces`) that assembles the engines, providers and policies you would
  otherwise assemble by hand, and hands them back so you can drop to the parts
  at any point. See [Your rules](https://wiggapony0925.github.io/moderato/docs/configuring).
- **Category rules** — `rules: { profanity: "allow" }`. A whole category
  permitted, queued or refused, in the words a product team uses. An explicit
  rule beats the tolerance, the audience defaults and the surface's own
  judgement, which is what makes it a rule; scope it to a surface when the
  decision is surface-shaped.
- **`WordlistOptions.allow`** — words your product is fine with, even though
  the vocabulary lists them. Matched with the same evasion-resistant matcher
  as listed words, so allowing `"ass"` also allows `"@ss"` and `"a s s"`. An
  allowance somebody can type around is not a setting.
- **`Moderation#mask`** — the offline masking pass, honouring the same
  allowances and rules as the screening.
- **A rules panel in the playground.** Every control is a real
  `defineModeration` field, the verdict on screen re-derives as you change
  them, and the panel prints the config being applied — copy it into your app.

### Fixed

- **`categories: { x: { review: Infinity } }` did not actually ignore a
  category.** The docs described it as the way to opt out of a category
  entirely, and it suppressed the *score* path while a provider's own `flag`
  walked straight past it — so `piiProvider`, which flags, was never opted out
  of. An unreachable review threshold now drops the category regardless of how
  it was raised.
- **An engine-cache collision in `defineModeration`.** Engines were keyed by
  surface kind and word allowances, so two surfaces differing only in audience
  shared one engine carrying the other's default policy. The key now includes
  the policy.
- **`verify:package` could not run on Node 18** — the script used
  `import.meta.dirname`, which lands in Node 20.11. The job that proves the
  tarball imports on the oldest supported Node could not itself start there.
  CI now runs it on 18 as well as 22.
- **CI's rehearsal guard failed on every run.** It diffed the committed report
  against a fresh one including `generatedAt`, a wall clock that differs by
  construction. `npm run check:rehearsal` compares every metric and ignores
  that field.
- **The Pages deploy built the site for four minutes and then failed** with
  "Get Pages site failed", because Pages was off for the repository.
  `actions/configure-pages` now runs first — so the failure is immediate — and
  asks GitHub to enable Pages itself. Where that is refused (creating a Pages
  site needs repository-admin rights `GITHUB_TOKEN` cannot hold, and a private
  repository additionally needs a paid plan), the job prints the two settings
  to change instead of a raw HTTP error.
- **CI's test matrix included a Node the test runner cannot start on.** Vitest
  needs `node:util`'s `styleText` (Node 20.12+), so the matrix is 20/22/24 and
  the Node 18 promise is verified where it is actually meaningful: importing
  the built tarball.

---

## [1.0.0]

**The first stable release.** From here the public API is a promise: see
[Versioning](https://wiggapony0925.github.io/moderato/upgrading) for what earns
a major, including the unusual rule that *a default which changes what gets
published or refused* is a breaking change even though it breaks no build.

### Added in 1.0.0

- **A documentation site** (`docs/`, Docusaurus) with versioned docs, a live
  **playground** and a live **metrics page**. It imports the real built
  package, so an example that stops compiling fails the build.
- **Rehearsals** — `npm run rehearse` scores the library against a labelled
  corpus (`corpus/*.jsonl`), sweeping the block threshold over one fixed
  classifier pass, and writes the report the metrics page renders. CI fails if
  the committed report does not match a fresh run, so the published numbers
  can never describe a version that no longer exists.
- **A corpus**, 52 hand-written cases covering evasion, the Scunthorpe class of
  false positive, threats, spam, identity fields, non-English text and empty
  input. The playground contributes more: every "no, that's wrong" is a
  labelled case, exportable as JSONL.
- **`npm run check:docs`** — the anti-drift guard. Fails on a public export no
  page mentions, and on a page importing a name that no longer exists.

### Fixed in 1.0.0

- **A consumer's loose transpiler could silently disable category matching.**
  `[...someSet]` is correct ES2015; a bundler transpiling spread in loose mode
  rewrites it to `[].concat(someSet)`, which appends the Set as ONE element
  instead of spreading it. Every category comparison then ran against a Set
  object, and screening failed closed to `review` with an opaque message. The
  library no longer spreads any non-array iterable — `Array.from` and
  `Map#forEach` survive every babel configuration. Found by looking at the
  rendered docs page, not by any test: the failure needs a bundler to appear.

---

## [0.2.0]

The release that makes moderato installable by somebody who isn't us: a way to
wrap ordinary input fields, the server half that can actually refuse a write,
and enough automation that the obvious cases never reach a human.

### Added

- **`useModeratedField`** (`moderato/react`) — wrap any input whose value other
  users will read: comments, usernames, display names, list titles, bios,
  product descriptions, support tickets.
  Debounced screening while typing, `check()` to flush the debounce at submit
  time, and plain state (`blocked`, `message`, `verdict`, `checking`) to drive
  your own popup. Renders nothing. Ships `inputProps` for the DOM and
  `nativeProps` for React Native.
- **`moderato/server`** — the enforcement half.
  - `guard(engine, input, options)` screens and throws a typed
    `ModerationError` (422) on a block; returns the verdict otherwise.
  - `createModerationHandler(engine, options)` is a Fetch-standard endpoint
    (Next route handlers, Hono, Bun, Deno, Workers) speaking the wire shape
    `httpProvider` already reads — so a browser engine can screen through your
    server without ever holding a vendor key.
  - `toNodeHandler(handler)` bridges Express/Connect/`node:http`.
  - `authorize`, `maxBytes`, and per-call `headers` on the handler; an open
    screening endpoint is a free classifier for the internet, billed to you.
- **`POLICY_PRESETS`** — `balanced` (comments, captions, descriptions),
  `identity` (usernames, display names, list and team titles — refuses anything
  that trips at all, because a handle has no "review it later"), `strict`
  (brand-safe and under-18 audiences), and `adult` (dating, 18+ communities,
  art and fiction).
- **`UNIVERSAL_ZERO_TOLERANCE`**, exported separately from
  `DEFAULT_ZERO_TOLERANCE`. The default set contains `sexual`, which is a
  product decision — the safe answer for a general-audience app and the wrong
  answer for an 18+ one. The universal set is the part that is not debatable
  anywhere, so a platform that allows adult content can build on it rather than
  subtracting from someone else's assumptions.
- **`PolicyConfig.blockScore`** and **`PolicyConfig.categories`** — refuse
  outright above a confidence, policy-wide or per category.
- **Provider chaining** — `chainProviders([cheap, expensive])`, also spelled
  `provider: [a, b]` on the engine. Stops at the first hit, so deliberate abuse
  never reaches your vendor bill. A provider that throws is skipped; only an
  all-dead chain fails.
- **`ModerationSink`** — every screening (`allow` included) is reported with
  its verdict, provider, duration, and your own `context`. Never awaited by the
  engine, never able to throw into it. Image bytes are never included.
- **Text screening memo** — repeated text is not re-billed. Keyed on the policy,
  because the same words are a block on a username and an allow in a comment.
  `cache: false` to disable, `clearCache()` to drop it.
- **`Verdict.rule` / `Verdict.primary` / `Verdict.screened`** — automation needs
  to tell a zero-tolerance refusal apart from a confidence-band one apart from a
  vendor outage. `screened: false` says plainly that an `allow` means "nothing
  ran", not "this passed".
- **`Moderato.screenDetailed()`** — the verdict plus the raw provider result.
- **Per-call `ScreenOptions`** — `policy` (one engine, many surfaces), `context`
  (for the sink), and `signal` (caller cancellation, honoured alongside the
  engine's own timeout).
- **`Moderato.screenText(text)`** for the common case.
- **141 tests**, covering every entry point, and `npm run verify:package`, which
  packs the tarball, unpacks it somewhere clean, and imports every published
  entry point as a real consumer would.

### Fixed

- **A single `!` used to switch the wordlist off.** `"!"` de-leets to `"i"`, so
  `shit!` normalised to `shiti` and matched nothing in any list. Tokens now also
  carry a `bare` form with leet-derived edges stripped, so `shit!` matches while
  `@ss` and `n1gg3r` still do.
- **An already-aborted signal hung the engine for the full provider latency.**
  `rejectOnAbort` listened for an `abort` event that had already fired; it now
  checks `signal.aborted` first.
- **Policy category lookup was quadratic** in the number of categories reported
  — a re-scan of every entry per lookup, thirteen deep on every omni-moderation
  call. Now one canonicalised map, built once.

### Changed

- **BREAKING (behaviour):** the default policy now refuses outright at
  `score ≥ 0.92` in any category, not only in `zeroTolerance`. Previously the
  only automatic refusals were zero-tolerance hits and everything else went to a
  human — which meant a wordlist hit on a slur at 0.99 confidence merely opened
  a case while the slur stayed live. Set `blockScore: Infinity` for the old
  behaviour.
- `ModeratoConfig.provider` also accepts an array (a chain).
- The package now resolves from `dist` — `main`, `module`, `types` and every
  `exports` condition. `prepare` builds it on install so a fresh clone or a
  linked workspace works without a separate step, and `verify:package` proves
  the published shape resolves. (`publishConfig.exports` was the tidier-looking
  option and is a trap: `npm pack` does not apply it, so the override is
  invisible until the tarball is already on the registry.) A monorepo that
  wants to develop against the TypeScript source should alias the subpaths to
  `src` in its own bundler config.
- Documentation no longer assumes the app this was first written for. Added an
  explicit "what this does not do": the offline wordlist is English-only, there
  is no built-in review queue or per-user state, video is frame-sampled and
  audio is not read at all, and a classifier score is not a substitute for
  hash-matching and reporting obligations if you host images at scale.

## [0.1.0]

- Initial extraction from the application it was written inside: the engine,
  the allow/review/block policy,
  OpenAI / HTTP / local / wordlist / mock providers, image and video
  normalisation, `useModeration`, `useModeratedSubmit`, `ModeratedUpload`, and
  the server-refusal contract (`refusalFrom`, 422).
