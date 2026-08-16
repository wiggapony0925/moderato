# The corpus

Labelled cases, one JSON object per line. This is what a **rehearsal** is scored
against, and it is the only reason any number on the metrics page means
anything.

```jsonc
{
  "id": "seed-0001",
  "text": "you are a nigger",       // what someone typed
  "expected": "block",              // what a human says should happen
  "surface": "comment",             // "comment" | "identity"
  "tags": ["hate", "slur"],         // free-form, for slicing the report
  "note": "unambiguous slur",       // why, for whoever reads a failure
  "source": "seed",                 // "seed" | "playground"
  "addedAt": "2026-08-16"
}
```

`expected` is one of `allow`, `review`, `block`. It is a **human judgement about
the desired outcome**, not a prediction of what the classifier does — the gap
between those two is exactly what a rehearsal measures.

## Files

| file | what it is |
|---|---|
| `seed.jsonl` | hand-written cases: the behaviours the library must never regress on |
| `playground.jsonl` | cases contributed from the docs playground (see below) |

Both are loaded together. Keep them separate so a bad batch of contributed
labels can be dropped without touching the hand-written floor.

## Contributing from the playground

The docs site has a playground where anyone can type anything, see the verdict,
and answer "did moderato get this right?". Those answers accumulate in the
browser and export as JSONL in exactly this format. Drop the file in here, run
`npm run rehearse`, and the metrics page updates.

**Review contributed labels before merging them.** A corpus is a claim about
what your product should do; anonymous strangers do not get to change that
claim unreviewed. Look for: labels that reflect a different product's policy,
`expected: "allow"` on things that are genuinely not allowed anywhere, and
duplicates of cases already covered.

## Content warning

This file contains slurs, threats and sexual language. It has to: a moderation
library that has never been tested against the real thing is a moderation
library with unknown behaviour. Nothing here is directed at anyone.
