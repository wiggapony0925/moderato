---
id: client-or-server
title: Client or server?
---

# Client or server?

**Both. They are different jobs, and only one of them is enforcement.**

|  | client | server |
| --- | --- | --- |
| what it buys you | speed, manners, not wasting a 40 MB upload | truth |
| can it be bypassed? | trivially — open the network tab | no |
| holds the vendor key? | never | yes |
| owns the refusal wording? | no | yes |
| what happens if it is wrong | a moment of friction | a published slur, or a deleted real post |

A client-only check is theatre. A server-only check is correct but rude: you
learn your video is unacceptable *after* uploading it, and your username is
rejected after you have filled in the whole signup form.

So: **screen on both, enforce on one.**

## The wiring

```
     browser                          your server                  vendor
┌────────────────────┐         ┌──────────────────────┐      ┌────────────┐
│ useModeratedField  │  POST   │ createModerationHandler     │            │
│  └ httpProvider ───┼────────▶│  └ engine ───────────┼─────▶│  OpenAI    │
│                    │◀────────┤     └ policy         │      │            │
│ useModeratedSubmit │  flags  └──────────────────────┘      └────────────┘
│  └ 422 → refusal   │◀───────  guard() throws 422 on the real write
└────────────────────┘
```

The browser never holds a credential. It asks your endpoint, your endpoint asks
the vendor, and the raw scores come back so the client can apply its own policy
locally — which is how a client can be *stricter* than the server without a
second endpoint.

## Why the policy is a plain object

`decide(result, policy)` is a pure function: no IO, no state, no clock. That is
what lets the same policy object ship to both halves and produce the same answer
in both places.

If the client re-implemented the rules, the two copies would drift the first
time either changed, and the failure mode is the nasty kind — a user is told
their post is fine, presses publish, and gets refused. Nobody files a bug for
that. They just leave.

## What each half must never do

**The client must never be the only screen.** Not because users are hostile —
most are not — but because the ones who are will find the gap in an afternoon,
and by then the content is in your database.

**The server must never invent its own refusal copy per endpoint.** Six handlers
means six slightly different apologies, one of which is a raw category list that
reads as an accusation and teaches evasion. Keep the strings in one registry and
pass them to `guard()`.

**Neither should tell the author about a `review`.** The post is live. Saying
"this is under review" for content that published fine is both untrue and
chilling, and it teaches people to self-censor around a classifier's blind spots.

## When you can skip the client half

You can. `useModeratedSubmit` alone gives you consistent handling of the
server's 422 with no client-side screening at all — that is the
**server-authoritative mode**, and an engine with no provider configured returns
`allow` with `screened: false` to say so honestly.

Do that when: your text is short and submitted immediately (no typing window to
warn during), or your bundle budget will not take a wordlist, or you simply do
not want a second place where policy lives.

Do **not** do it when someone is about to upload 40 MB.
