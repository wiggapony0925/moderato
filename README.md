# moderato

**Content moderation, in tempo.** Wrap any input, image picker, or upload with
`allow` / `review` / `block` screening — OpenAI omni-moderation, your own
endpoint, or offline rules. Zero runtime dependencies. TypeScript throughout.
Client for speed, server for truth.

```bash
npm install moderato
```

**📖 [Full documentation](https://wiggapony0925.github.io/moderato)** —
guides, API reference, a [playground](https://wiggapony0925.github.io/moderato/playground)
you can type anything into, and [live metrics](https://wiggapony0925.github.io/moderato/rehearsal)
measuring how well it actually does against a labelled corpus.

---

Anywhere one person types something another person reads: a comment box, a
username, a product listing, a support ticket, a review, a class discussion
board, a dating profile, a marketplace description. Different products, same
three problems.

---

## The 30-second version

Someone types a slur into your username field. You want three things:

1. they find out **now**, not after they've filled in the rest of the form;
2. the write is **refused by your server**, because anything a browser decides
   can be skipped with `curl`;
3. **you** never get paged about it — the obvious cases should not need a human,
   and the ambiguous ones should be the only thing in your review queue.

moderato is those three things.

```tsx
// 1. the field — instant feedback, your popup
const handle = useModeratedField({ engine, policy: POLICY_PRESETS.identity });

<input {...handle.inputProps} />
{handle.blocked && <YourDialog text={handle.message} />}
```

```ts
// 2. the server — the only screen that can actually refuse
const verdict = await guard(engine, { text: body }, { message: RULES_COPY });
// throws ModerationError (422) on block; returns "review"/"allow" otherwise
```

```ts
// 3. the automation — high confidence acts, the middle queues
createModerato({
  provider: [wordlist, classifier],
  policy: { blockScore: 0.92 },   // ≥0.92 is refused outright, no human
  sink: (event) => metrics.record(event),
});
```

---

## Where does screening go — client or server?

**Both. They are different jobs.**

|  | client | server |
| --- | --- | --- |
| what it's for | speed, kindness, saving an upload | truth |
| can it be bypassed? | trivially | no |
| holds the vendor key? | never | yes |
| owns the refusal copy? | no | yes |

A client-only check is theatre: open the network tab and it's gone. A
server-only check is correct but rude — you learn your 40 MB video is
unacceptable *after* uploading it, and your username is rejected after you've
filled in the whole signup form.

So: **screen on both, enforce on one.** The client-side engine points at *your*
endpoint (`httpProvider`), your endpoint holds the vendor key and the real
policy, and the same `decide()` runs on both sides so they agree.

```
     browser                          your server                    vendor
┌────────────────────┐         ┌──────────────────────┐        ┌────────────┐
│ useModeratedField  │  POST   │ createModerationHandler       │            │
│  └ httpProvider ───┼────────▶│  └ engine ───────────┼───────▶│  OpenAI    │
│                    │◀────────┤     └ policy         │        │            │
│ useModeratedSubmit │  flags  └──────────────────────┘        └────────────┘
│  └ 422 → refusal   │◀───────  guard() throws 422 on the real write
└────────────────────┘
```

---

## Install and wire up

### The engine

```ts
import { createModerato, openAIProvider, POLICY_PRESETS } from "moderato";

export const engine = createModerato({
  provider: openAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  policy: POLICY_PRESETS.balanced,
  timeoutMs: 6000,
  failMode: "review",   // a vendor outage is not your outage
});
```

`openAIProvider` refuses to run in a browser without
`dangerouslyAllowBrowser: true`, because that ships your API key to every
visitor. In the browser, use `httpProvider` against your own endpoint.

### The endpoint (Next.js, Hono, Bun, Deno, Workers — anything Fetch-standard)

```ts
// app/api/moderate/route.ts
import { createModerationHandler } from "moderato/server";
import { engine } from "@/lib/moderation";

export const POST = createModerationHandler(engine, {
  authorize: (req) => Boolean(getSession(req)),   // not a free classifier
});
```

Express / Connect:

```ts
import { createModerationHandler, toNodeHandler } from "moderato/server";
app.post("/api/moderate", toNodeHandler(createModerationHandler(engine)));
```

### The browser engine

```ts
import { createModerato, httpProvider, wordlistProvider, PROFANITY_PRESET } from "moderato";

export const engine = createModerato({
  provider: [
    wordlistProvider(PROFANITY_PRESET),        // instant, offline, free
    httpProvider({ url: "/api/moderate" }),    // your server, your key
  ],
});
```

An array is a **chain**: the wordlist runs first and the request is never made
if it hits. Deliberate abuse costs you nothing; the ambiguous rest gets a real
classifier's opinion.

---

## `useModeratedField` — wrap any input

The hook for anything a user types that other users will read: comments,
usernames, display names, list and team titles, bios, product and listing
descriptions.

```tsx
import { useModeratedField } from "moderato/react";
import { POLICY_PRESETS } from "moderato";

function UsernameField() {
  const name = useModeratedField({
    engine,
    policy: POLICY_PRESETS.identity,
    onBlocked: () => track("username_refused"),
  });

  return (
    <>
      <input {...name.inputProps} aria-label="Username" />
      {name.checking && <Spinner />}
      {name.blocked && (
        <MyOwnPopup onDismiss={name.dismiss}>{name.message}</MyOwnPopup>
      )}
      <button
        disabled={name.blocked}
        onClick={async () => {
          // Flushes the debounce — closes the "typed it and hit enter
          // inside the debounce window" hole.
          if (!(await name.check()).ok) return;
          await api.setUsername(name.value);   // the server screens again
        }}
      >
        Save
      </button>
    </>
  );
}
```

**It renders nothing.** No dialog, no styling, no copy of its own beyond a
default sentence you will replace. Moderation UI is a product decision and a
component that made it for you is the first thing you'd delete.

| you get | what it is |
| --- | --- |
| `inputProps` | spread onto `<input>`/`<textarea>` — value, handlers, `aria-invalid`, `aria-describedby` |
| `nativeProps` | the same for React Native `<TextInput>` |
| `messageProps` | put on the element showing `message`, so screen readers announce it |
| `blocked` | the current value should not be published |
| `message` | author-facing copy while blocked, else `null` |
| `verdict` | the full decision — categories, score, which rule fired |
| `checking` | a screen is in flight |
| `check()` | screen NOW, skipping the debounce; `{ ok, verdict }` |
| `dismiss()` / `reset()` | hide the message / clear the field |

Options: `debounceMs` (400), `minLength` (2), `screenOn` (`"change"` \| `"blur"`),
`blockOn` (`["block"]`), `policy`, `message`, `onBlocked`, `onCleared`, plus
`value`/`onChange` for controlled mode.

Repeated text is memoised, so a field that re-screens on every pause in typing
does not re-bill you for the same sentence.

---

## `useModeratedSubmit` — one way to publish

Every publish surface can come back refused. Without a shared hook each screen
invents its own handling: one shows a toast, one fails silently, one leaves a
spinner running forever.

```tsx
const { submit, refusal, dismiss, pending, error } = useModeratedSubmit(
  createPost,                       // a TanStack mutation or a plain async fn
  { onDone: () => closeComposer() },
);
```

* **refused (422)** → `refusal` holds *the server's own words*, the draft is
  kept, `onBlocked` fires;
* **published** → `onDone`;
* **anything else** → `error`, the ordinary failure path;
* **queued for review** → invisible to the author, because the post is live and
  telling someone "this is under review" would be both untrue and chilling.

---

## `ModeratedUpload` — pickers and uploads

```tsx
import { ModeratedUpload } from "moderato/web";

<ModeratedUpload
  accept="image/*,video/mp4"
  multiple
  remaining={4 - images.length}
  engine={engine}                                  // omit for no preflight
  onAccept={(files) => setImages([...images, ...files])}
  onReject={(_files, verdict) => showSheet(verdict)}
>
  {({ open, screening }) => (
    <button onClick={open} disabled={screening}>Add photos</button>
  )}
</ModeratedUpload>
```

Videos are sampled to frames (browser only) and screened as stills — multi-modal
endpoints take images, not video.

---

## The policy

Raw classifier output → one of three actions. Pure function, no IO, so the same
call gives the same answer on the server and in the browser.

```
                      score
  0 ─────────── reviewScore ────────── blockScore ────────── 1
  │   allow          │      review         │      block      │
  │  (silent)        │  (publish + queue)  │   (refuse 422)  │
```

Plus: **any hit in `zeroTolerance` blocks at any score.**

| preset | for | behaviour |
| --- | --- | --- |
| `balanced` | feeds, comments, captions, descriptions | review from 0.55, refuse from 0.92 |
| `identity` | usernames, display names, team and list titles | refuses anything that trips at all |
| `strict` | brand-safe surfaces, under-18 audiences | review from 0.3, refuse from 0.8 |
| `adult` | dating, 18+ communities, art and fiction | refuses only what is indefensible anywhere |

`identity` is stricter on purpose. There is no "publish it and review later" for
a handle — it is already on every row the account touches by the time anyone
looks. Nobody is owed their first choice of username.

```ts
// or roll your own
{
  reviewScore: 0.55,
  blockScore: 0.92,
  zeroTolerance: ["sexual/minors", "hate/threatening"],
  categories: { hate: { review: 0.3, block: 0.7 } },   // per-category
}
```

Set `blockScore: Infinity` for "only zeroTolerance ever blocks" — every other
call goes to a human.

### The defaults are opinions. Two of them are yours to overrule.

**`sexual` is in the default zero-tolerance set.** That is a product decision,
not a law of nature. It is the default because it is the safe answer for a
general-audience app, an app-store listing, or anything a sponsor sees — and
it is flatly the wrong answer for a dating app, an art community, or any 18+
platform, where refusing adult content means refusing the product. If that is
you, use `POLICY_PRESETS.adult` or pass your own `zeroTolerance`.
`UNIVERSAL_ZERO_TOLERANCE` is exported separately: the categories no service
anywhere benefits from publishing, with nothing debatable in it.

**`blockScore: 0.92` decides things without a human.** That number is a
defensible starting point, not a measured one, and the right value depends on
your classifier, your audience and how much moderator time you have. Run the
sink for a week before trusting it — and if your compliance posture requires a
person on every removal, set `blockScore: Infinity` and keep the queue.

### On automation

The default `blockScore` of `0.92` exists because a queue you cannot clear is a
queue nobody reads. A classifier returning 0.97 on hate is not making a
judgement call; routing that to a human means the slur is live for hours, and
over a weekend, days. Everything below the line still publishes and queues,
because that band is where the false positives are — community vocabulary is
full of "sick", "insane", "killer" and "steal", and auto-deleting on a
classifier's say-so deletes real posts every day.

Move the line with your own data, not your gut. That's what the sink is for.

---

## Providers

| provider | sees text | sees images | cost | offline |
| --- | --- | --- | --- | --- |
| `openAIProvider` | ✓ | ✓ | free endpoint, needs a key | ✗ |
| `httpProvider` | ✓ | ✓ | your endpoint | ✗ |
| `wordlistProvider` | ✓ | ✗ | free | ✓ |
| `localProvider` | ✓ | ✗ | free | ✓ |
| `mockProvider` | — | — | — | ✓ |

`chainProviders([a, b])` runs them cheap-first and stops at the first hit
(`mode: "all"` merges every opinion instead). A provider that throws is skipped;
only an all-dead chain fails, and the engine turns that into `review`.

### About wordlists

`wordlistProvider` survives `f u c k`, `n1gger`, `fuuuck`, `shit!` and
zero-width splitting, while leaving `Scunthorpe`, `classic` and `assassin`
alone — matching is whole-token over normalised text, never substring. It ships
`PROFANITY_PRESET` (curated, safe on a live community) and
`PROFANITY_PRESET_STRICT` (the full LDNOOBW corpus, expect clinical words to
trip).

It is still a wordlist. It does not understand "I hate black people" — no slur,
no match — and it cannot see images at all, which is most of the risk. Use it as
the free instant layer *in front of* a classifier, never as the classifier.

---

## Failure behaviour

| situation | verdict | why |
| --- | --- | --- |
| no provider configured | `allow`, `screened: false` | screening is off on purpose; not a pass |
| nothing to screen | `allow` | — |
| provider throws / times out | `failMode` (default `review`) | a vendor's outage is not your outage, and nobody looked at this yet |
| every provider in a chain dead | `review` | as above |

`screen()` never throws. `verdict.rule` tells you which of these happened, so a
`review` from an outage can be handled differently from a `review` from a real
flag.

---

## Telemetry and the review queue

```ts
createModerato({
  provider,
  sink: async (event) => {
    metrics.timing("moderation.ms", event.durationMs, { provider: event.provider });
    if (event.verdict.action !== "allow") {
      await db.moderationCases.create({
        action: event.verdict.action,
        categories: event.verdict.categories,
        score: event.verdict.score,
        excerpt: event.input.text,
        ...(event.context as { userId: string }),
      });
    }
  },
});
```

Every screening is reported, `allow` included — a queue you can only see the bad
half of is a queue you cannot tune. Image bytes are never in the event, only a
count. The sink is never awaited by the engine and cannot throw into it: a
broken logger must not be able to fail a publish.

Opening the review case is deliberately **not** in the library. That needs your
database and your idea of a case, and a library that guessed at either would be
wrong for everyone. `verdict.action === "review"` is the signal; the queue is
yours.

---

## What this does not do

Worth knowing before you build on it.

**It is not multilingual below the classifier.** `openAIProvider` and your own
endpoint see raw text and handle whatever language it is in. The *offline*
layer does not: `PROFANITY_PRESET` is English, and `normalizeTokens` de-leets
and de-accents on Latin-alphabet assumptions. If your users write in Turkish or
Japanese, the instant client-side layer will quietly find nothing. Supply your
own vocabulary — `wordlistProvider([{ category: "hate", words: [...] }])` takes
any list, and phrases as well as words — or lean on the classifier and accept
the round trip.

**It has no review queue and no database.** `verdict.action === "review"` is
the signal and the `sink` is the firehose; the queue, the case model and the
moderator UI are yours. A library that guessed at any of those would be wrong
for everyone.

**It holds no per-user state.** Repeat offenders, escalation, rate limits,
shadowbans and appeals all need to know who someone is and what they did last
week. Pass your user id as `context` and build that on the sink.

**It does not see audio**, and it screens video by sampling frames — enough to
catch a clip whose whole point is the problem, not enough to catch four bad
seconds in a ten-minute upload.

**It is not a compliance product.** A classifier's `sexual/minors` score is a
guess. If you host user images at any scale you probably also need hash
matching against known-CSAM databases and a reporting path to the relevant
authority, and neither is something an npm package can give you. Refusing the
write is the floor, not the obligation.

---

## API

```ts
// moderato
createModerato, Moderato, decide, canonical
POLICY_PRESETS, DEFAULT_ZERO_TOLERANCE, UNIVERSAL_ZERO_TOLERANCE
DEFAULT_REVIEW_SCORE, DEFAULT_BLOCK_SCORE, DEFAULT_REFUSAL_MESSAGE
openAIProvider, httpProvider, wordlistProvider, localProvider, mockProvider
chainProviders, mergeResults
PROFANITY_PRESET, PROFANITY_PRESET_STRICT, EN_PROFANITY, normalizeTokens
bytesToDataUri, downscaleImage, toImagePart, sampleFrames, frameTimestamps
refusalFrom, REFUSED_STATUS, blocked, needsReview, TtlCache

// moderato/react   — hooks only; safe in React DOM and React Native
useModeratedField, useModeratedSubmit, useModeration, refusalFrom

// moderato/web     — DOM components
ModeratedUpload

// moderato/server  — Node/edge; no framework dependency
guard, ModerationError, isModerationError
createModerationHandler, toNodeHandler
```

---

## Requirements

Node ≥ 18 (needs `fetch`/`Request`). React ≥ 18 is an *optional* peer — the core
and server entry points do not import it. ESM and CJS builds, types for every
entry point, no runtime dependencies.

## Rehearsals

A version number tells you nothing about whether a moderation library still
catches slurs. So every release is scored against a labelled corpus:

```bash
npm run build && npm run rehearse
```

One classifier pass, then the policy replayed at every threshold in a sweep —
so the curve is a controlled experiment rather than fifty separate ones. The
report lands in `docs/static/rehearsal/latest.json`, the
[metrics page](https://wiggapony0925.github.io/moderato/rehearsal) renders it,
and CI fails if the committed numbers do not match a fresh run.

The corpus lives in `corpus/*.jsonl` and is meant to be forked. These numbers
are measured against one idea of acceptable; replace the cases with text from
your own product and re-run, and only then do they mean anything about your
users.

## Contributing

```bash
npm install
npm test                 # 143 tests
npm run typecheck
npm run build
npm run verify:package   # packs, unpacks, imports every entry point
npm run rehearse         # regenerate the metrics
npm run check:docs       # no undocumented or stale API
npm run docs:start       # the site, locally
```

Documentation is not optional here: `check:docs` fails CI on a public export
no page mentions, and on a docs page importing a name that no longer exists.

## License

MIT
