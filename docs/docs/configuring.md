---
id: configuring
title: Your rules
sidebar_label: Your rules
---

# Your rules

No two products want the same moderation, and most of them do not want the
default. Instagram allows swearing in comments; a children's game allows none
of it; a dating app allows adult content that a school platform would refuse on
sight. Same library, same classifier, three different products — and none of
them should be forking a wordlist to say so.

`defineModeration` is where you say it. One object, in the words you would use
in a meeting.

```ts title="lib/moderation.ts"
import { defineModeration, httpProvider } from "moderato";

export const moderation = defineModeration({
  rules: { profanity: "allow" },   // people swear here, that's fine
  deny: ["ourcompetitor"],         // this, however, is not fine
  personalData: ["card", "ssn"],
  surfaces: {
    comment: { kind: "body" },
    username: { kind: "identity" },
  },
  provider: httpProvider({ url: "/api/moderate" }),
});
```

Then use it:

```ts
await moderation.screen(text, "comment");        // → a verdict
useModeratedField({ ...moderation.field("username") });
moderation.mask(text, "comment");                // → hide it instead of refusing
```

That is the whole surface area. Everything below is what each line does and
when you would reach for it.

:::tip You are not locked in
`defineModeration` builds the same engines and policies you would have built by
hand, and hands them back — `moderation.engineFor()` and
`moderation.policyFor()`. You can drop to the parts at any point, for one
surface or all of them, without unpicking anything.
:::

## The three dials

They are deliberately different sizes, and picking the right one is most of the
job.

| dial | scope | reach for it when |
| --- | --- | --- |
| `rules` | a whole category | the category itself is wrong for your product |
| `allow` / `deny` | individual words | the category is right and a few members are not |
| `surfaces` | where the above apply | a username should not be judged like a comment |

### `rules` — a category, permitted or refused

```ts
defineModeration({
  rules: {
    profanity: "allow",   // never acted on, even if the classifier flags it
    sexual: "review",     // always noted, never refused
    harassment: "block",  // refused at any score
  },
});
```

Three values, and they mean exactly what they say:

- **`"allow"`** — the category is ignored entirely. Not "scored lower" —
  ignored. This is the Instagram setting: swearing is part of how people talk
  here, and a queue full of it is a queue nobody reads.
- **`"review"`** — always surfaced to a human, never refused automatically.
  For the categories where you want to know but do not want a machine deciding.
- **`"block"`** — refused at any score, like the built-in zero-tolerance set.

A rule beats everything else — the tolerance, the audience defaults, and the
surface's own judgement — because you wrote it and they are guesses.
`{ sexual: "review" }` really does take `sexual` out of the refuse-outright
set; that is the point of an 18+ product saying it. And a top-level
`{ profanity: "allow" }` allows profanity in usernames too, which is usually
not what people mean. Put a rule on the surface it belongs to:

```ts
surfaces: {
  comment:  { kind: "body", rules: { profanity: "allow" } },
  username: { kind: "identity" },   // still refuses it
}
```

Category names are whatever your provider reports. The built-in matcher reports
`profanity`, `hate` and `denied`; OpenAI reports `sexual`, `harassment`,
`violence`, `self-harm/intent` and the rest; your own endpoint reports whatever
you make it report.

### `allow` and `deny` — individual words

Sometimes the category is right and you just disagree about four words in it.

```ts
defineModeration({
  allow: ["damn", "hell", "ass"],  // mild, and we are not a school
  deny: ["ourcompetitor"],         // not in the vocabulary, refused anyway
});
```

**`allow` is matched the same evasion-resistant way listed words are.** Allowing
`"ass"` also allows `"@ss"`, `"a s s"` and `"asses"`, which is the point: an
allowance somebody can type around is not a setting, it is a trap.

**`deny` is always refused**, at any tolerance, on any surface. That is what
denying a word means; making it depend on a threshold would be a different
feature. Pass an object if you want the refusals to arrive labelled:

```ts
deny: {
  spam:  ["freerobux", "clickhere"],
  brand: ["ourcompetitor"],
}
// → verdict.primary === "spam"
```

Which then means you can rule on them separately: `rules: { spam: "review" }`
if you would rather see those before acting.

### `surfaces` — where each rule applies

A comment and a username are not the same problem, and the difference is not
strictness.

```ts
surfaces: {
  comment:  { kind: "body" },
  username: { kind: "identity" },
  kidsChat: { kind: "body", audience: "minor" },
  bio:      { kind: "body", rules: { profanity: "allow" } },
}
```

`kind: "identity"` changes two things. Anything that trips at all is refused
rather than queued — there is no "publish it and review later" for a handle,
because by the time a moderator opens the queue it is on every byline and
follower row the account touches. And the matcher starts looking *inside* long
tokens, because a username has no spaces to tokenise on and `bastardcollector`
is exactly the shape abuse takes on a name field.

```ts
await moderation.screen("what a bastard", "comment");   // → review
await moderation.screen("what a bastard", "username");  // → block
await moderation.screen("bastardcollector", "comment");  // → allow
await moderation.screen("bastardcollector", "username"); // → block
```

Per-surface `rules` and `allow` merge over the global ones, so a bio can be
looser than a comment without restating everything.

Surfaces you never declare fall back to the defaults, which means you can start
with `moderation.screen(text)` and name surfaces later, as you find you need
them.

## Tolerance and audience

Two coarse settings underneath the dials, for the cases where you do not want
to think about any of this yet.

```ts
defineModeration({ tolerance: "balanced", audience: "general" });
```

`tolerance` moves the automation line — how confident a machine must be before
it acts alone:

| tolerance | queues from | refuses from |
| --- | --- | --- |
| `strict` | 0.3 | 0.8 |
| `balanced` *(default)* | 0.55 | 0.92 |
| `open` | 0.7 | 0.96 |

`audience` changes *what is refused outright*, which is a different question
from how strictly:

| audience | effect |
| --- | --- |
| `general` *(default)* | the standard refuse-outright set, `sexual` included |
| `adult` | only what is indefensible anywhere — threats, `sexual/minors` |
| `minor` | profanity and harassment become refusals, **and personal data becomes zero-tolerance** |

That last one is the one worth reading twice. A twenty-two-year-old posting
their phone number to arrange a collection is doing something completely
ordinary. A thirteen-year-old doing exactly the same thing is the situation
child-safety law exists about. The text is identical; the risk is not. See
[Personal data & age](./personal-data.md) for what that preset does and the
three things it does not do.

moderato cannot know anyone's age — that is your account system. Set the
audience on the surface, or build a second `defineModeration` for minors and
pick between them at the call site.

## Personal data

Off by default, because a marketplace where people arrange collection wants
phone numbers to pass and would be furious if they did not.

```ts
personalData: ["card", "ssn"],   // detect these, ignore the rest
personalData: "all",             // every detector
```

Short names or the full `pii/` ones, whichever you prefer. The detectors and
what validates them are in [Personal data & age](./personal-data.md) — the
short version is that every one of them proves itself (Luhn for cards, the
never-issued ranges for SSNs) rather than matching a shape and hoping.

You can rule on them like anything else:

```ts
personalData: "all",
rules: { "pii/email": "allow", "pii/phone": "review" },
```

## Hiding instead of refusing

```ts
moderation.mask("call me on +44 7700 900123 you bastard", "comment");
// → "call me on ############### you #######"
```

Worth stealing from Roblox, whose chat filter does not refuse messages — it
replaces the offending characters and sends the message anyway. The
conversation survives, and the evader learns nothing: a refusal tells someone
exactly which word tripped so they can go and find one that does not.

`mask` respects the same configuration everything else does. A word you allowed
is not masked; a category you allowed is not masked; a username is scanned
fused because that surface is. Pass your own mask as a third argument:

```ts
moderation.mask(text, "comment", "***");
moderation.mask(text, "comment", labelled);  // "[phone removed]"
```

It is offline only, and that is a real limit rather than an oversight: masking
needs to know *which characters* to replace, and a classifier that returns
`{ hate: 0.97 }` for a whole message has not told you that. See
[Masking](./personal-data.md#masking-instead-of-refusing) for when it is the
wrong answer.

## Worked examples

Four real products, in full.

### A social app that lets people talk like people

```ts
export const moderation = defineModeration({
  personalData: ["card", "ssn"],
  surfaces: {
    // Swearing in a comment is how people talk. In a handle it is permanent.
    comment: { kind: "body", rules: { profanity: "allow" } },
    username: { kind: "identity" },
    displayName: { kind: "identity" },
  },
  provider: httpProvider({ url: "/api/moderate" }),
});
```

Slurs are refused on every surface, comments included — `hate` is not
`profanity`, and keeping them apart is why the built-in vocabulary lists them
separately.

Note where the rule sits. Written at the top level it would apply everywhere,
including the username field, because **an explicit rule beats the surface's
own judgement** — that is what makes it a rule rather than a suggestion. If a
decision is comment-shaped, put it on the comment surface.

### A children's game

```ts
export const moderation = defineModeration({
  tolerance: "strict",
  audience: "minor",
  personalData: "all",
  surfaces: { chat: {}, username: { kind: "identity" } },
  provider: httpProvider({ url: "/api/moderate" }),
});

// Chat gets masked rather than refused; the conversation survives.
const safe = moderation.mask(message, "chat");
```

### An 18+ community

```ts
export const moderation = defineModeration({
  audience: "adult",
  rules: { profanity: "allow", sexual: "allow" },
  surfaces: { post: {}, username: { kind: "identity" } },
});
```

Refuses only what is indefensible anywhere: `sexual/minors`, threats,
`violence/graphic`, `self-harm/instructions`. That set does not move, and
`audience: "adult"` is the setting that says the rest of it is your product
rather than a failure.

### A marketplace

```ts
export const moderation = defineModeration({
  personalData: ["card", "ssn", "location"],
  deny: { offPlatform: ["venmo", "cashapp", "zelle"] },
  rules: { offPlatform: "review" },
  surfaces: { listing: {}, message: {}, shopName: { kind: "identity" } },
});
```

Phone numbers and emails pass, because arranging a handover is the product.
Card numbers and SSNs never do. Attempts to take a payment off-platform are
queued rather than refused — you want to see them, and a false positive costs
you a sale.

## When you outgrow it

`defineModeration` is a constructor, not a container. If it stops fitting, take
the parts:

```ts
const engine = moderation.engineFor("comment");
const policy = moderation.policyFor("comment");

// …or build your own and keep using the rest
createModerato({
  provider: [wordlistProvider(MY_VOCABULARY), piiProvider(), myClassifier],
  policy: { reviewScore: 0.4, blockScore: 0.85, zeroTolerance: [...] },
});
```

The signs you have outgrown it: you need per-category numeric thresholds rather
than allow/review/block, you are chaining four providers with different timeout
budgets, or your surfaces differ in ways that are not kind, audience, words or
rules. All three are perfectly good reasons, and [Policy](./policy.md) and
[Providers](./providers.md) are where they are answered.

## Next

- [Policy](./policy.md) — the thresholds underneath, and rolling your own
- [Personal data & age](./personal-data.md) — the detectors, masking, minors
- [The field hook](./field-hook.md) — wiring a surface to an input
- [Playground](./playground.mdx) — try your own rules against your own text
