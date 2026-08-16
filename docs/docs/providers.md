---
id: providers
title: Providers
---

# Providers

A provider is one method:

```ts
interface ModerationProvider {
  readonly name: string;
  classify(input: NormalizedInput, signal?: AbortSignal): Promise<ProviderResult>;
}
// ProviderResult = { flags: Record<string, boolean>; scores: Record<string, number> }
```

Text and images go in **one call**. One call per screened thing keeps latency
and vendor bills sane, and it is how multi-modal endpoints want their input.

| provider | text | images | cost | offline |
| --- | --- | --- | --- | --- |
| `openAIProvider` | ✓ | ✓ | free endpoint, needs a key | ✗ |
| `httpProvider` | ✓ | ✓ | your endpoint | ✗ |
| `wordlistProvider` | ✓ | ✗ | free | ✓ |
| `localProvider` | ✓ | ✗ | free | ✓ |
| `mockProvider` | — | — | — | ✓ |

## `openAIProvider`

```ts
openAIProvider({ apiKey: process.env.OPENAI_API_KEY! });
```

One `fetch` against `omni-moderation-latest` — no SDK dependency. Classifies
text and images together across the categories that matter: sexual,
sexual/minors, hate, harassment, violence, self-harm, illicit.

It **throws if constructed in a browser** unless you pass
`dangerouslyAllowBrowser: true`, because that ships your API key to every
visitor. In a browser, use `httpProvider` against your own endpoint.

## `httpProvider`

```ts
httpProvider({ url: "/api/moderate" });
```

Posts `{ text, images: [dataUri, …] }` and reads `{ flags, scores }` back —
exactly what [`createModerationHandler`](./server.md) returns. For a different
endpoint shape, pass `map`:

```ts
httpProvider({
  url: "https://vendor.example/v1/classify",
  headers: { "x-api-key": key },
  map: (payload) => ({
    flags: payload.labels,
    scores: payload.confidences,
  }),
});
```

## `wordlistProvider`

Evasion-resistant whole-token matching, offline.

```ts
import { wordlistProvider, PROFANITY_PRESET, PROFANITY_PRESET_STRICT } from "moderato";

wordlistProvider(PROFANITY_PRESET);        // curated; safe on a live community
wordlistProvider(PROFANITY_PRESET_STRICT); // full LDNOOBW corpus; expect clinical words to trip
```

It survives `f u c k`, `n1gger`, `fuuuck`, `shit!` and zero-width splitting,
while leaving `Scunthorpe`, `classic` and `assassin` alone. Matching is
whole-token over normalised text, never substring, and listed words also match
common inflections (`fuck` → `fucking`, `fuckers`). Multi-word entries match as
consecutive-token phrases.

Bring your own vocabulary — any list, any categories:

```ts
wordlistProvider([
  { category: "hate", words: ["…"], score: 0.99 },
  { category: "spam", words: ["free robux", "click here"], score: 0.8 },
]);
```

**It is still a wordlist.** It does not understand "I hate black people" — no
listed word, no match — and it cannot see images at all, which is most of the
risk. It is the free instant layer *in front of* a classifier, never the
classifier. The [metrics page](./rehearsal.mdx) measures exactly how much it
misses on its own; the number is not flattering, and it is not meant to be.

## Chaining

```ts
createModerato({
  provider: [
    wordlistProvider(PROFANITY_PRESET),      // microseconds, offline, free
    httpProvider({ url: "/api/moderate" }),  // a network round trip
  ],
});
```

Equivalent to `chainProviders([...])`. Runs in order and **stops at the first
provider that flags anything**, so the deliberate slur never reaches your vendor
bill and the ambiguous 99% still gets a real opinion.

A provider that throws is skipped and the chain continues; only an all-dead
chain fails, and the engine turns that into `review`. Use `mode: "all"` to run
every provider and merge, keeping the highest score per category — a second
opinion on everything, at the cost of paying for everything.

## `localProvider`

Regex rules, when a wordlist is the wrong shape:

```ts
localProvider([
  { category: "spam", pattern: /\b(?:https?:\/\/\S+){3,}/i, score: 0.8 },
  { category: "pii", pattern: /\b\d{3}-\d{2}-\d{4}\b/, score: 0.95 },
]);
```

Each call compiles a fresh regex, so a `/g/` pattern does not remember where it
stopped last time.

## `mockProvider`

Part of the public API on purpose: everyone who adopts a moderation layer needs
to test the paths they hope never fire.

```ts
mockProvider({ script: () => ({ flags: { hate: true }, scores: { hate: 0.99 } }) });
mockProvider({ latencyMs: 5000 });                    // exercise the timeout
mockProvider({ failWith: new Error("vendor down") }); // exercise failMode
```

## Writing your own

```ts
const perspective: ModerationProvider = {
  name: "perspective",
  async classify({ text }, signal) {
    const res = await fetch(url, { signal, body: JSON.stringify({ comment: { text } }) });
    const data = await res.json();
    return {
      flags: {},                                   // let the policy decide from scores
      scores: { harassment: data.attributeScores.TOXICITY.summaryScore.value },
    };
  },
};
```

Two rules. **Honour the signal** — the engine races an abort alongside your call
and will give up regardless, but a provider that ignores it leaves a request in
flight. And **throw on failure rather than returning empty scores**; an empty
result is indistinguishable from "clean", which turns an outage into a silent
allow.
