# moderato

**Content moderation, in tempo.** Wrap any input, image picker, or upload with
`allow` / `review` / `block` screening — OpenAI omni-moderation, your own
endpoint, or offline rules. Zero runtime dependencies. TypeScript throughout.
Client for speed, server for truth.

```bash
npm install moderato
```

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
usernames, display names, collection and list titles, bios, listing
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
| `balanced` | feeds, comments, captions | review from 0.55, refuse from 0.92 |
| `identity` | usernames, display names, collection titles | refuses anything that trips at all |
| `strict` | brand-safe surfaces | review from 0.3, refuse from 0.8 |

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

## API

```ts
// moderato
createModerato, Moderato, decide, canonical
POLICY_PRESETS, DEFAULT_ZERO_TOLERANCE, DEFAULT_REVIEW_SCORE, DEFAULT_BLOCK_SCORE
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

## Contributing

```bash
npm install
npm test           # 135 tests
npm run typecheck
npm run build
npm run verify:package   # packs, unpacks, imports every entry point
```

## License

MIT
