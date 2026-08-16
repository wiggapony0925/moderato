/**
 * The landing page's opening.
 *
 * One job: make the shape of the library obvious in five seconds — three
 * places, three different jobs — and then get out of the way. No logo wall,
 * no testimonials, no gradient. The credibility argument on this site is the
 * metrics page, and pointing at it is worth more than any adjective.
 */

import Link from "@docusaurus/Link";
import styles from "./styles.module.css";

export function Hero({ version }: { version: string }): JSX.Element {
  return (
    <header className={styles.hero}>
      <span className={styles.badge}>
        <span className={styles.badgeDot} aria-hidden /> v{version} · MIT · zero
        dependencies
      </span>
      <h1 className={styles.title}>
        Content moderation,
        <br />
        <span className={styles.titleAccent}>in tempo.</span>
      </h1>
      <p className={styles.lede}>
        Wrap any input, image picker or upload with allow / review / block
        screening. Instant and offline in the browser, authoritative on your
        server, and automated enough that only the genuinely ambiguous cases
        ever reach a person.
      </p>
      <div className={styles.actions}>
        <Link className={styles.cta} to="/quickstart">
          Get started
        </Link>
        <Link className={styles.ctaGhost} to="/playground">
          Try the playground
        </Link>
      </div>
      <pre className={styles.install}>
        <code>npm install moderato</code>
      </pre>
    </header>
  );
}

const PLACES = [
  {
    step: "1",
    title: "In the field",
    tag: "moderato/react",
    body: "Screens as it is typed — debounced, memoised, offline. It renders nothing: you own the popup, the copy and the styling.",
    to: "/field-hook",
    linkText: "useModeratedField",
  },
  {
    step: "2",
    title: "At the write",
    tag: "moderato/server",
    body: "The only screen that can actually refuse. One chokepoint, one typed 422, one registry of refusal wording your whole product shares.",
    to: "/server",
    linkText: "guard()",
  },
  {
    step: "3",
    title: "In the policy",
    tag: "moderato",
    body: "A pure function shipped to both halves, so the browser's preflight and the server's refusal can never disagree about the rules.",
    to: "/policy",
    linkText: "decide()",
  },
];

export function Places(): JSX.Element {
  return (
    <section className={styles.places} aria-label="Where moderato runs">
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
    </section>
  );
}

/** Small, factual claims. Every one of them is checked by something in CI. */
const FACTS = [
  { value: "0", label: "runtime dependencies" },
  { value: "4", label: "entry points, all typed" },
  { value: "143", label: "tests" },
  { value: "52", label: "labelled corpus cases" },
];

export function Facts(): JSX.Element {
  return (
    <dl className={styles.facts}>
      {FACTS.map((fact) => (
        <div key={fact.label} className={styles.fact}>
          <dt className={styles.factValue}>{fact.value}</dt>
          <dd className={styles.factLabel}>{fact.label}</dd>
        </div>
      ))}
    </dl>
  );
}
