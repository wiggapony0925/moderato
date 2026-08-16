# The moderato documentation site, for Cloud Run.
#
# Built from the repo root, not from docs/, and that is load-bearing: the docs
# import the REAL built package (`../dist`) so that every live example on the
# site — the playground, the threshold explorer — runs the same files npm
# ships. A page that claims an API exists therefore fails the build if it
# doesn't. Building docs/ alone would have nothing to resolve `moderato` to.
#
# Deploy: gcloud run deploy moderato-docs --source . --region us-central1 --port 8080
# (or `npm run deploy:docs`, which is the same line with the flags filled in.)

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Manifests first, so a source-only edit reuses the install layers.
COPY package.json package-lock.json ./
COPY docs/package.json docs/package-lock.json ./docs/

# `npm ci` runs `prepare`, which runs the build — but the source isn't copied
# yet at that point, so skip lifecycle scripts here and build explicitly below.
RUN npm ci --ignore-scripts
RUN npm ci --prefix docs --ignore-scripts

COPY tsconfig.json tsup.config.ts vitest.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY corpus ./corpus
COPY docs ./docs

# The library first: the docs resolve `moderato` to dist/.
RUN npm run build

# The guards that would otherwise only run in CI. A docs image that builds
# while the docs describe an API that no longer exists is worse than a failed
# deploy — nobody notices until a reader does.
RUN npm run check:docs
RUN npm --prefix docs run build

# ── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve
COPY docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/docs/build /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
