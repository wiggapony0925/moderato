---
id: policy
title: Policy
---

# Policy

Raw classifier output → one of three actions. `decide(result, policy)` is a pure
function: no IO, no state, no clock. That is what lets the same policy object
run on the server and in the browser and give the same answer.

```
                      score
  0 ─────────── reviewScore ────────── blockScore ────────── 1
  │   allow          │      review         │      block      │
  │  (silent)        │  (publish + queue)  │   (refuse 422)  │
```

Plus: **any hit in `zeroTolerance` blocks at any score.**

## The three actions

| action | what your code does | what the author sees |
| --- | --- | --- |
| `allow` | write it | nothing |
| `review` | write it **and** open a case | nothing |
| `block` | refuse — nothing is written | your refusal copy |

`review` publishing is the load-bearing decision in the whole library. Ordinary
speech is full of "sick", "insane", "killer" and "kill it"; auto-deleting on a
classifier's say-so deletes real posts every day. The band between
`reviewScore` and `blockScore` is exactly where the false positives live, so it
is the only band a human should be spending time in.

## Presets

```ts
import { POLICY_PRESETS } from "moderato";
```

| preset | for | behaviour |
| --- | --- | --- |
| `balanced` | comments, captions, descriptions | review from 0.55, refuse from 0.92 |
| `identity` | usernames, display names, team and list titles | refuses anything that trips at all |
| `strict` | brand-safe surfaces, under-18 audiences | review from 0.3, refuse from 0.8 |
| `adult` | dating, 18+ communities, art and fiction | refuses only what is indefensible anywhere |
| `minor` | where the author is under age | strictest, and personal information becomes zero-tolerance |

`identity` is stricter on purpose. There is no "publish it and review later" for
a handle: by the time a moderator opens the queue it is on every byline, comment
and follower row the account touches. Nobody is owed their first choice of
username.

## Rolling your own

```ts
{
  reviewScore: 0.55,
  blockScore: 0.92,
  zeroTolerance: ["sexual/minors", "hate/threatening"],
  categories: {
    hate: { review: 0.3, block: 0.7 },   // per-category overrides
  },
}
```

Set `blockScore: Infinity` for "only `zeroTolerance` ever blocks" — every other
call goes to a human.

## Two defaults are opinions, and you should overrule them

### `sexual` is in the default zero-tolerance set

That is a product decision, not a law of nature. It is the default because it is
the safe answer for a general-audience app, an app-store listing, or anything a
sponsor sees. It is flatly the wrong answer for a dating app, an art community,
or any 18+ platform, where refusing adult content means refusing the product.

```ts
import { POLICY_PRESETS, UNIVERSAL_ZERO_TOLERANCE } from "moderato";

POLICY_PRESETS.adult;          // built on the universal set
[...UNIVERSAL_ZERO_TOLERANCE]; // the part nothing debatable is in
```

`UNIVERSAL_ZERO_TOLERANCE` is exported separately so a platform that allows
adult content can build from first principles rather than subtracting from
someone else's assumptions. It still contains `sexual/minors`.

### `blockScore: 0.92` decides things without a human

A defensible starting point, not a measured one. The right value depends on your
classifier, your audience, and how much moderator time you have — and it is
genuinely a trade: every step down refuses more real posts, every step up leaves
more work for people.

Do not guess. Run the [rehearsal](./rehearsal.mdx) against your own labelled
cases and look at the curve. There is a slider on that page; drag it and watch
precision and queue volume move in opposite directions.

`minor` is not just "stricter". The change that matters is that phone numbers,
emails and locations become refusals rather than queue items — a child
publishing their address is not something a moderator can usefully catch up on
next Tuesday. See [Personal data & age](./personal-data.md).

## Per-surface policy

One engine, many surfaces. Pass `policy` per call rather than building four
engines:

```ts
await engine.screenText(caption);                                  // engine default
await engine.screenText(handle, { policy: POLICY_PRESETS.identity });
await guard(engine, { text: bio }, { policy: POLICY_PRESETS.identity });
useModeratedField({ engine, policy: POLICY_PRESETS.identity });
```

The memo is keyed on the policy, so the same words screened as a comment and as
a username are two cache entries, not one.

## Reading a verdict

```ts
interface Verdict {
  action: "allow" | "review" | "block";
  categories: string[];   // worst first, canonical names
  score: number;          // highest category score seen
  detail?: string;
  rule?: "clean" | "zero-tolerance" | "block-score" | "flagged" | "failed" | "not-screened";
  primary?: string;       // the category that drove the action
  screened?: boolean;     // false = nothing ran; NOT the same as "passed"
}
```

`rule` is there for automation. A zero-tolerance refusal, a confidence-band
refusal and a vendor outage all deserve different follow-ups, and without it
they are three identical-looking objects.

## Category names

Providers spell attributes with underscores (`sexual_minors`); policies are
written the way the docs spell them (`sexual/minors`). `canonical()` normalises,
and `decide()` canonicalises both sides — so you can write your policy however
reads best.
