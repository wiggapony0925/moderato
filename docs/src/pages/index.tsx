/**
 * The landing page.
 *
 * Its only job is to get someone into the documentation with the right idea
 * already in their head: that this is three things in three places, that the
 * interesting case is not "block everything", and that the claims are
 * measured rather than asserted. Everything on it links into `/docs`.
 */

import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { BlockedDemo } from "@site/src/components/Home/BlockedDemo";
import styles from "./index.module.css";

const PLACES = [
  {
    step: "01",
    title: "In the field",
    tag: "moderato/react",
    body: "Screens as it is typed — debounced, memoised, offline. It renders nothing: you own the popup, the copy and the styling.",
    to: "/docs/field-hook",
    linkText: "useModeratedField",
  },
  {
    step: "02",
    title: "At the write",
    tag: "moderato/server",
    body: "The only screen that can actually refuse. One chokepoint, one typed 422, one registry of refusal wording your whole product shares.",
    to: "/docs/server",
    linkText: "guard()",
  },
  {
    step: "03",
    title: "In the policy",
    tag: "moderato",
    body: "A pure function shipped to both halves, so the browser's preflight and the server's refusal can never disagree about the rules.",
    to: "/docs/policy",
    linkText: "decide()",
  },
];

/** Every one of these is checked by something in CI. */
const FACTS = [
  { value: "0", label: "runtime dependencies" },
  { value: "4", label: "entry points, all typed" },
  { value: "234", label: "tests" },
  { value: "60", label: "labelled corpus cases" },
];

const SNIPPET = `import { useModeratedField } from "moderato/react";
import { POLICY_PRESETS } from "moderato";

const name = useModeratedField({
  engine,
  policy: POLICY_PRESETS.identity,
});

<input {...name.inputProps} />
{name.blocked && <YourDialog text={name.message} />}`;

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const version = String(siteConfig.customFields?.libraryVersion ?? "");

  return (
    <Layout
      title="Content moderation, in tempo"
      description="Wrap any input, image picker or upload with allow / review / block screening. Client for speed, server for truth."
    >
      <main className={styles.main}>
        {/* ── banner ── */}
        <section className={styles.banner}>
          <div className={styles.bannerGrid} aria-hidden />
          <div className={styles.bannerInner}>
            <div className={styles.copy}>
              <span className={styles.badge}>
                <span className={styles.badgeDot} aria-hidden />v{version} · MIT ·
                zero dependencies
              </span>
              <h1 className={styles.title}>
                Content moderation,
                <br />
                <span className={styles.titleAccent}>in tempo.</span>
              </h1>
              <p className={styles.lede}>
                Wrap any input, image picker or upload with{" "}
                <strong>allow / review / block</strong> screening. Instant and
                offline in the browser, authoritative on your server, and
                automated enough that only the genuinely ambiguous cases ever
                reach a person.
              </p>
              <div className={styles.actions}>
                <Link className={styles.cta} to="/docs/quickstart">
                  Read the docs
                </Link>
                <Link className={styles.ctaGhost} to="/docs/playground">
                  Try the playground
                </Link>
              </div>
              <div className={styles.install}>
                <code>
                  <span className={styles.prompt}>$</span> npm install moderato
                </code>
              </div>
            </div>

            <div className={styles.demo}>
              <BlockedDemo />
            </div>
          </div>
        </section>

        {/* ── facts ── */}
        <section className={styles.section}>
          <dl className={styles.facts}>
            {FACTS.map((fact) => (
              <div key={fact.label} className={styles.fact}>
                <dt className={styles.factValue}>{fact.value}</dt>
                <dd className={styles.factLabel}>{fact.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── three places ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Three places, three jobs</h2>
          <p className={styles.sectionLede}>
            A client-side check is a courtesy to honest users; it stops nobody
            who opens the network tab. A server-only check is correct but rude.
            So: screen on both, enforce on one.
          </p>
          <div className={styles.places}>
            {PLACES.map((place) => (
              <article key={place.step} className={styles.place}>
                <span className={styles.placeStep}>{place.step}</span>
                <h3 className={styles.placeTitle}>{place.title}</h3>
                <code className={styles.placeTag}>{place.tag}</code>
                <p className={styles.placeBody}>{place.body}</p>
                <Link className={styles.placeLink} to={place.to}>
                  {place.linkText} →
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* ── code peek ── */}
        <section className={styles.section}>
          <div className={styles.split}>
            <div>
              <h2 className={styles.sectionTitle}>It renders nothing</h2>
              <p className={styles.sectionLede}>
                No dialog, no styling, no copy of its own beyond one sentence
                you will replace. The hook returns state; you build the UI.
                Moderation wording is a product decision, and a component that
                made it for you would be the first thing you deleted.
              </p>
              <Link className={styles.inlineLink} to="/docs/field-hook">
                Read the field-hook guide →
              </Link>
            </div>
            <pre className={styles.snippet}>
              <code>{SNIPPET}</code>
            </pre>
          </div>
        </section>

        {/* ── evidence ── */}
        <section className={styles.section}>
          <div className={styles.evidence}>
            <div>
              <h2 className={styles.sectionTitle}>Numbers, not adjectives</h2>
              <p className={styles.sectionLede}>
                Most libraries in this space describe their accuracy with an
                adjective. This one publishes the measurement, the whole
                precision/recall curve, and every single case it gets wrong —
                regenerated on every release, with CI failing if the committed
                report does not match a fresh run.
              </p>
              <p className={styles.sectionLede}>
                The first thing you will notice is that the free offline layer
                alone catches barely half of what it should. That gap is the
                argument for the classifier behind it, and hiding it would have
                made the page marketing.
              </p>
              <Link className={styles.cta} to="/docs/rehearsal">
                See the metrics
              </Link>
            </div>
            <div className={styles.evidenceStats}>
              <div className={styles.evidenceStat}>
                <span className={styles.evidenceValue}>100%</span>
                <span className={styles.evidenceLabel}>
                  precision — of everything auto-refused, how much deserved it
                </span>
              </div>
              <div className={styles.evidenceStat}>
                <span className={styles.evidenceValue}>65%</span>
                <span className={styles.evidenceLabel}>
                  recall from the offline layer alone — published anyway
                </span>
              </div>
              <div className={styles.evidenceStat}>
                <span className={styles.evidenceValue}>87%</span>
                <span className={styles.evidenceLabel}>
                  of cases decided with no moderator involved
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── final CTA ── */}
        <section className={styles.finale}>
          <h2 className={styles.finaleTitle}>Five minutes, three files.</h2>
          <p className={styles.finaleLede}>
            A field that screens as you type, a server that refuses the write,
            and one refusal message your whole product shares.
          </p>
          <div className={styles.actions}>
            <Link className={styles.cta} to="/docs/quickstart">
              Start the quickstart
            </Link>
            <Link className={styles.ctaGhost} to="/docs/">
              Browse all docs
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
