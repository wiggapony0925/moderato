---
id: deploying
title: Publishing the docs
---

# Publishing the docs

Two ways. One needs nothing but a phone.

## From a phone

GitHub Pages builds and publishes the site itself. No CLI, no credentials, no
local checkout — GitHub already has the repository and the workflow. What it
does need is a browser once, to turn Pages on.

**Before the first deploy — two checks, both in a phone browser:**

1. **Is the repository private?** Pages on a private repository requires
   GitHub Pro, Team or Enterprise; on the free plan it is public repositories
   only. If yours is private and you are on Free, either make it public
   (**Settings → General → Danger Zone → Change visibility**) or upgrade. For
   a package heading to npm, public is usually the answer — but it publishes
   the whole history, so it is a decision, not a checkbox.
2. **Turn Pages on:** **Settings → Pages → Build and deployment → Source →
   GitHub Actions**.

**After that, push and it publishes.** To publish on demand instead of waiting
for a push: **Actions → Deploy docs (GitHub Pages) → Run workflow**, which is
two taps in the GitHub mobile app.

The site lands at `https://<your-username>.github.io/<repo>/` and the URL is
printed at the top of the workflow run.

:::note "Get Pages site failed" / "Resource not accessible by integration"
Both mean Pages is off and the workflow could not turn it on for you. It does
try — `actions/configure-pages` runs with `enablement: true` — but creating a
Pages site needs repository-admin rights, and `GITHUB_TOKEN` cannot be granted
those. The job fails early with the two steps above printed in its log rather
than building for four minutes first.
:::

The workflow builds the library first, runs `check:docs`, then builds the
site — so a broken deploy fails for the same reasons CI does. It also sets
`DOCS_BASE_URL` for you, because Pages serves from a sub-path and a site built
for the root would load none of its own assets.

:::tip Why this one and not the other
Cloud Run is the better long-term home — your own domain, your own caching,
the same shape as everything else you deploy. It also needs `gcloud`, a
signed-in machine and credentials. Pages needs a browser once and then
nothing. Use Pages now; switch when you are back at a computer, and keep both
if you like.
:::

## From a computer, to Cloud Run

The same deployment shape as the rest of the estate: a multi-stage image,
nginx on 8080, one command.

```bash
npm run deploy:docs
# → gcloud run deploy moderato-docs --source . --region us-central1 \
#     --port 8080 --allow-unauthenticated
```

The build runs from the repository root rather than `docs/`, because the site
imports the real built package. Inside the image the order is library →
`check:docs` → site, so a deploy fails for the same reasons CI does instead of
shipping a site that describes an API that no longer exists.

`nginx.conf` caches fingerprinted assets for a year, the rehearsal report for
five minutes, and HTML not at all. A docs page lagging a deploy is the exact
failure this whole arrangement exists to prevent.

## Anywhere else

The output is a plain static directory — `docs/build` — with no server
requirements at all. Netlify, Vercel, Cloudflare Pages and S3 will all serve it,
and all three of the first ones can be set up entirely in a browser by pointing
them at the repository:

| setting | value |
| --- | --- |
| build command | `npm ci && npm run build && npm ci --prefix docs && npm --prefix docs run build` |
| output directory | `docs/build` |
| Node version | 22 |
| environment | `DOCS_BASE_URL=/` |

The two `npm ci` calls are not a mistake. The library and the site have
separate lockfiles, and the library must be built before the site can resolve
`moderato` to anything.

## Publishing the package itself

Different thing, and it does need a terminal — npm requires an authenticated
session and a one-time password:

```bash
npm publish
```

`prepublishOnly` runs typecheck, tests, build, tarball verification, a fresh
rehearsal and the docs check first, so a broken package cannot reach the
registry even if somebody skips the checklist. See
[Versioning & upgrading](./upgrading.md).
