---
id: limits
title: What it does not do
---

# What it does not do

Worth knowing before you build on it. None of these are on a roadmap to be
fixed by this package; several of them should not be.

## It is not multilingual below the classifier

`openAIProvider` and your own endpoint see raw text and handle whatever language
it is in. The **offline** layer does not: `PROFANITY_PRESET` is English, and
`normalizeTokens` de-leets and de-accents on Latin-alphabet assumptions.

If your users write in Turkish or Japanese, the instant client-side layer will
quietly find nothing — the corpus has cases for exactly this, and you can see
them fail on the [metrics page](./rehearsal.mdx). Supply your own vocabulary:

```ts
wordlistProvider([{ category: "hate", words: ["…", "…"], score: 0.99 }]);
```

Words *and* phrases, any script — but the leetspeak normalisation will not help
you outside Latin text, so expect to list more variants by hand.

## It has no review queue and no database

`verdict.action === "review"` is the signal and the `sink` is the firehose. The
queue, the case model, the moderator UI, the audit trail and the appeals flow
are yours. A library that guessed at any of those would be wrong for everyone,
and you would spend longer working around the guess than building it.

## It holds no per-user state

Repeat offenders, escalation, rate limits, shadowbans, trust levels, appeals —
all of these need to know who someone is and what they did last week. Pass your
user id as `context` and build it on the sink:

```ts
sink: async (event) => {
  if (event.verdict.action === "block") {
    const strikes = await redis.incr(`strikes:${event.context.userId}`);
    if (strikes >= 3) await restrictAccount(event.context.userId);
  }
};
```

## It does not read audio, and video is sampled

Video is screened by sampling stills across its duration — six frames by
default. That catches a clip whose whole point is the problem. It will not catch
four bad seconds in the middle of ten minutes, and it never hears the soundtrack.

If audio matters to your product, transcribe first and screen the transcript as
text.

## It is not a compliance program

A classifier's `sexual/minors` score is a guess. If you host user images at any
scale you probably also need hash matching against known-CSAM databases and a
reporting path to the relevant authority in your jurisdiction, and neither is
something an npm package can give you.

Refusing the write is the floor. It is not the obligation.

## It cannot make the policy decision for you

The defaults here are defensible starting points chosen by people who do not
know your users. `blockScore: 0.92` is a number somebody picked; `sexual` in the
default zero-tolerance set is a product position that is wrong for entire
categories of legitimate business.

The [rehearsal](./rehearsal.mdx) exists so that you can replace those defaults
with measurements instead of with a different guess.

## It will have false positives

Every moderation system does. Ordinary speech is full of "sick", "insane",
"killer" and "kill it"; clinical language trips profanity lists; reclaimed slurs
are used affectionately inside the communities they came from and as weapons
outside them, and no classifier can tell which is which from the text alone.

That is why `review` publishes rather than blocking, why the refusal copy names
the policy rather than the category, and why the draft is never wiped. Design
for being wrong, because you will be.
