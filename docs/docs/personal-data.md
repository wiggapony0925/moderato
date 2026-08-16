---
id: personal-data
title: Personal data & age
---

# Personal data & age

Toxicity is not the only thing people post that they should not. This page
covers the other two: personal information, and the fact that the same message
means different things depending on who typed it.

## Personal information

```ts
import { piiProvider, findPii, redactPii, PII_CATEGORIES } from "moderato";
```

Six detectors, and you choose which ones you want:

| category | what it finds | how it is validated | default score |
| --- | --- | --- | --- |
| `pii/card` | payment card numbers | **Luhn checksum** | 0.97 → refused |
| `pii/ssn` | US social security numbers | ranges the SSA never issued | 0.96 → refused |
| `pii/email` | email addresses | — | 0.80 → queued |
| `pii/phone` | phone numbers, international and national | digit count + separator shape | 0.78 → queued |
| `pii/location` | coordinates precise enough to be a house | ≥ 4 decimal places, valid lat/long | 0.75 → queued |
| `pii/ip` | IPv4 addresses | octet range, first octet > 9 | 0.55 → queued |

### Why a regex is not a detector

If you match sixteen digits, you flag every order number your users ever paste.
So every rule here has to prove itself:

```ts
findPii("card 4242 4242 4242 4242");  // → [{ category: "pii/card", … }]
findPii("order 1234567890123456");     // → []  (same shape, fails Luhn)

findPii("ssn 123-45-6789");            // → [{ category: "pii/ssn", … }]
findPii("ssn 666-45-6789");            // → []  (666 was never issued)

findPii("call +44 7700 900123");       // → [{ category: "pii/phone", … }]
findPii("posted on 2026-08-16");       // → []  (a date, not a number)
findPii("upgrade to 1.2.3");           // → []  (a version)
```

Roughly nine in ten random sixteen-digit strings fail Luhn. That single check is
the difference between a detector and a thing your team turns off in week two.

### Choosing what your product allows

This is the part you asked about, and it is deliberately just a list:

```ts
// A marketplace: people arrange collection, so phone numbers are the product.
// Card numbers never are.
piiProvider({ categories: ["pii/card", "pii/ssn"] });

// A support tool: agents need the phone number and the email.
piiProvider({ categories: ["pii/card", "pii/ssn", "pii/location"] });

// A kids' app: all of it.
piiProvider();
```

Leaving a category out means it is never detected — cheaper than detecting it
and then deciding to ignore it. If you want it detected but treated more
gently, that is a [policy](./policy.md) question instead:

```ts
createModerato({
  provider: piiProvider(),
  policy: {
    categories: {
      "pii/phone": { review: 0.9, block: Infinity }, // noted, never refused
      "pii/email": { review: Infinity },             // ignored entirely
    },
  },
});
```

### Hiding it instead of refusing it

Refusing a whole message because it contains one phone number is often the
wrong answer. `redactPii` gives you the other one:

```ts
redactPii("ring me on +44 7700 900123 tomorrow");
// → "ring me on [phone removed] tomorrow"

redactPii(text, { mask: () => "•••" });
redactPii(text, { categories: ["pii/card"] });
```

Two good uses. Publishing the message with the personal part removed, which is
kinder than a refusal and usually what the person meant anyway. And showing a
moderator what was posted **without** putting somebody's card number in your
review queue, where it will sit in a database for a year.

`findPii` returns start and end offsets, so you can highlight rather than
replace if you would rather ask the author to fix it themselves.

### Composing it

PII is just another provider, so it chains:

```ts
createModerato({
  provider: [
    piiProvider({ categories: ["pii/card", "pii/ssn"] }), // instant, offline
    wordlistProvider(PROFANITY_PRESET),                   // instant, offline
    httpProvider({ url: "/api/moderate" }),               // your classifier
  ],
});
```

## Masking, instead of refusing

Worth stealing from Roblox, whose chat filter does not refuse messages — it
replaces the offending characters with hashes and sends the message anyway.

Two things fall out of that which are easy to miss.

**The conversation survives.** Somebody writes four sentences arranging a
meet-up and one of them has their phone number in it. Refusing the whole
message throws away the other three and tells them nothing useful.

**The evader learns nothing.** A refusal is a signal: it tells someone exactly
which word tripped, so they can go and find one that does not. Hashes tell
them a filter exists and nothing else.

```ts
import { findTerms, findPii, maskSpans, hashes, labelled, PROFANITY_PRESET } from "moderato";

const text = "call me on +44 7700 900123 you bastard";
const spans = [...findTerms(text, PROFANITY_PRESET), ...findPii(text)];

maskSpans(text, spans);            // "call me on ############### you #######"
maskSpans(text, spans, labelled);  // "call me on [phone removed] you [profanity removed]"
maskSpans(text, spans, "***");     // "call me on *** you ***"
```

Offsets come from the tokeniser, so they point at what was actually typed —
`"f u c k"` masks as seven hashes, spaces included, and a de-leeted `n1gger`
masks all six characters. Anything that finds spans works: `findTerms` for
vocabulary, `findPii` for personal data, and your own detectors if they return
`{ category, value, start, end }`.

**It is not free.** Masking is silent about a real violation, so it belongs on
ordinary vocabulary and personal information — not on threats. Use it where you
would otherwise have queued something, and keep refusing what deserves
refusing.

## Age, and who is asking

> Should a 13-year-old be allowed to post something a 22-year-old can?

Often no, and the interesting part is *why* not — because it is usually not
about the words.

A twenty-two-year-old posting their phone number to arrange a collection is
doing something completely ordinary. A thirteen-year-old doing exactly the same
thing is the situation child-safety law exists about. **The text is identical.
The risk is not.**

That is what `POLICY_PRESETS.minor` encodes:

```ts
import { POLICY_PRESETS } from "moderato";

await guard(engine, { text }, {
  policy: user.isMinor ? POLICY_PRESETS.minor : POLICY_PRESETS.balanced,
});
```

Two things change, and the second matters more:

1. **The bar moves down.** Stricter thresholds, and profanity and harassment
   become refusals rather than queue items.
2. **Personal information becomes zero-tolerance.** Phone, email, location,
   card, SSN — refused at any score, every time. A queue a moderator reaches on
   Tuesday is not a control for a child publishing their address today.

### Three things this does not do

**It does not know anyone's age.** That is your account system. moderato takes
a policy; deciding which one applies is yours.

**It is not compliance.** COPPA, the UK Age Appropriate Design Code and their
equivalents impose obligations no library can discharge — age assurance, data
minimisation, parental consent, retention limits. This preset is a floor to
build on, not a box to tick.

**It is about the author, not the audience.** Everything moderato does happens
at write time: it decides whether *this person* may post *this thing*. Deciding
what a thirteen-year-old should be shown is a different problem — it depends on
who is reading, not who wrote it, and it belongs in your feed query rather than
in a write-time screen. The `review` verdict and the `sink` give you the labels
to build that with; the filtering is yours.

## Other languages

Being straight with you: this is the weakest part of the library, and the gap
is uneven.

**The classifier handles it.** `openAIProvider` and your own endpoint see raw
text and read whatever language it is in. If most of your users do not write in
English, that layer is not optional for you.

**The offline layer is Latin-script and English.** `PROFANITY_PRESET` is English
words. The normalisation folds Cyrillic and Greek homoglyphs *into* Latin — so
someone disguising an English word with a Cyrillic `е` is caught — but it does
nothing for text genuinely written in Turkish, Japanese, or Arabic. There is no
vocabulary for those, and no tokenisation for scripts without spaces.

**You can bring your own.** The provider takes any list:

```ts
createModerato({
  provider: [
    wordlistProvider(PROFANITY_PRESET),  // English
    wordlistProvider(ES_PROFANITY),      // yours
    wordlistProvider(JA_PROFANITY),      // yours
    httpProvider({ url: "/api/moderate" }),
  ],
});
```

Expect to list more variants by hand for a language the leetspeak and
run-collapsing rules were not designed around. The corpus has cases for exactly
this — Spanish profanity and a Japanese insult — and you can watch them fail on
the [metrics page](./rehearsal.mdx). They are in there so the gap has a number
against it rather than a footnote.

## Special characters

Already handled, and measured on the [evasion matrix](./algorithm.mdx):
leetspeak, spacing, stretched letters, punctuation used as letters, zero-width
splitting, and homoglyphs from Cyrillic, Greek and the small-capital blocks.

The one that is still open is a listed word broken up by characters the
normaliser keeps — and the honest answer is that this is an arms race with no
finish line. Every rule you add to catch a disguise is a rule somebody can
route around. That is why the offline layer is a *first* layer and the
classifier sits behind it: a matcher can be evaded by construction, and a model
that reads meaning has to be evaded by writing something that means something
else.
