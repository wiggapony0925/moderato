---
id: client-or-server
title: Client or server?
---

# Client or server?

Short answer: **both**, and they are doing different jobs.

That sounds like a cop-out, so here is why it is not.

## What each half is actually for

Put a check in the browser and you can tell someone their username is a
problem while they are still typing it. No round trip, no waiting, no filling
in the rest of the signup form first. That is genuinely nice, and it costs you
almost nothing.

It is also completely optional from the user's point of view. Anyone can open
the network tab, see the request your app makes, and make that request
themselves without ever loading your JavaScript. So a browser check stops
people who were not trying to get around it — which is most people, but not
the ones you are worried about.

Put the check on your server and it cannot be skipped. Every write goes
through it. But now the only feedback anyone gets is after they hit submit,
which means you find out your 40 MB video is unacceptable *after* uploading
it.

Neither half is optional. They just are not the same thing.

|  | in the browser | on your server |
| --- | --- | --- |
| what it gives you | speed, and not wasting people's time | the actual decision |
| can it be skipped? | yes, trivially | no |
| holds your API key? | never | yes |
| owns the wording of a refusal? | no | yes |
| if it is wrong | a moment of friction | a published slur, or a deleted real post |

So: **screen in both places, enforce in one.**

## How the two stay in agreement

Here is the failure this is designed to avoid. Your browser check says the
comment is fine. The user hits post. The server refuses it. They have no idea
why, and nothing they try helps.

Nobody files a bug for that. They just stop posting.

It happens whenever the two halves have separate copies of the rules, because
the copies drift the first time either one changes. So moderato does not have
two copies. The decision is one pure function:

```ts
decide(result, policy);
```

No network, no state, no clock — just scores in, verdict out. You pass the same
policy object to both halves, and they cannot disagree, because they are
running the same code on the same input.

## The wiring

```
     browser                          your server                  vendor
┌────────────────────┐         ┌──────────────────────┐      ┌────────────┐
│ useModeratedField  │  POST   │ createModerationHandler     │            │
│  └ httpProvider ───┼────────▶│  └ engine ───────────┼─────▶│  OpenAI    │
│                    │◀────────┤     └ policy         │      │            │
│ useModeratedSubmit │  scores └──────────────────────┘      └────────────┘
│  └ 422 → refusal   │◀───────  guard() throws 422 on the real write
└────────────────────┘
```

The browser never holds a credential. It asks your endpoint; your endpoint asks
the vendor. The raw scores come back, so the browser can apply its own policy
locally — which is how a client can end up *stricter* than the server without
needing a second endpoint.

## Three rules worth keeping

**The browser is never the only screen.** Not because your users are hostile —
almost none of them are — but because the few who are will find the gap in an
afternoon, and by then the content is in your database.

**Refusal wording lives in one place on the server.** Six endpoints means six
slightly different apologies, and one of them will end up being a raw list of
classifier categories, which reads like an accusation and teaches people
exactly what to route around. Keep the strings together and pass them to
`guard()`.

**Nobody is told their post is "under review".** It published. It is live. Telling
someone otherwise is untrue, and it teaches careful people to self-censor
around a classifier's blind spots.

## You can skip the browser half

`useModeratedSubmit` on its own gives you consistent handling of the server's
422 with no client-side screening at all. An engine with no provider configured
returns `allow` with `screened: false`, which says plainly that nothing ran
rather than pretending the text passed.

That is a reasonable choice when your text is short and submitted immediately
(there is no typing window to warn during), or when you do not want a second
place where policy lives.

Do not skip it when somebody is about to upload something large.
