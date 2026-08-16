# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — unreleased

The release that makes moderato installable by somebody who isn't us: a way to
wrap ordinary input fields, the server half that can actually refuse a write,
and enough automation that the obvious cases never reach a human.

### Added

- **`useModeratedField`** (`moderato/react`) — wrap any input whose value other
  users will read: comments, usernames, display names, collection titles, bios.
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
- **`POLICY_PRESETS`** — `balanced` (feeds and comments), `identity`
  (usernames, display names, collection titles — refuses anything that trips at
  all, because a handle has no "review it later"), and `strict`.
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
- **136 tests**, covering every entry point, and `npm run verify:package`, which
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
  invisible until the tarball is already on the registry.) Consumers that want
  to develop against the source alias it themselves — see the Vite config in
  loupe-web and `scripts/sync-moderato.mjs` in loupe-frontend.

## [0.1.0]

- Initial extraction from loupe: the engine, the allow/review/block policy,
  OpenAI / HTTP / local / wordlist / mock providers, image and video
  normalisation, `useModeration`, `useModeratedSubmit`, `ModeratedUpload`, and
  the server-refusal contract (`refusalFrom`, 422).
