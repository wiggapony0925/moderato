/**
 * The algorithm, as a worked example.
 *
 * A boxes-and-arrows diagram of a text pipeline tells you the names of the
 * stages and nothing else. Showing one real string being taken apart tells
 * you what each stage is *for* — and every step below is the actual
 * behaviour of `normalizeTokens` and `wordlistProvider`, not an
 * illustration of them.
 */

import styles from "./viz.module.css";

interface Step {
  n: string;
  title: string;
  value: string;
  note: string;
}

const STEPS: Step[] = [
  {
    n: "1",
    title: "What was typed",
    value: "n1g​gЗr!",
    note: "A zero-width space between the g's, a digit for the i, a Cyrillic З for the e, and a trailing bang. Four evasions, none of them clever, all of them free.",
  },
  {
    n: "2",
    title: "Fold",
    value: "niggeri",
    note: "NFKD decomposition, accents dropped, zero-width characters removed, homoglyphs mapped to their Latin twins, leetspeak resolved. The final “i” is the exclamation mark — “!” maps to “i”, and that is a real problem the next step exists to fix.",
  },
  {
    n: "3",
    title: "Tokenise",
    value: '[ "niggeri" ]',
    note: "Split on anything that is not a letter, then merge runs of single letters, so “f u c k” becomes one token. Word boundaries are kept everywhere else — that is what protects “Scunthorpe”.",
  },
  {
    n: "4",
    title: "Three variants per token",
    value: 'exact "niggeri" · collapsed "nigeri" · bare "nigger"',
    note: "Collapsed folds repeated letters, so “fuuuck” matches. Bare strips characters the leet map invented at the edges, which is how “shit!” survives. Keeping all three costs two strings and misses neither.",
  },
  {
    n: "5",
    title: "Match",
    value: "bare = nigger  →  hate 0.99",
    note: "Whole-token, against the list and its common inflections; then multi-word phrases across consecutive tokens; then — on identity fields only — listed words of six letters or more welded inside a longer token.",
  },
  {
    n: "6",
    title: "Decide",
    value: "0.99 ≥ blockScore → block",
    note: "The policy is a pure function of the scores. Zero-tolerance categories refuse at any score; everything else refuses above the confidence line and queues below it.",
  },
];

export function Pipeline(): JSX.Element {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figCaption}>
        <strong>One string, all the way through.</strong> Every step is the
        real behaviour of the code, not an illustration of it.
      </figcaption>

      <ol className={styles.pipeline}>
        {STEPS.map((step, i) => (
          <li key={step.n} className={styles.stage}>
            <div className={styles.stageMark}>
              <span className={styles.stageNum}>{step.n}</span>
              {i < STEPS.length - 1 && <span className={styles.stageLine} aria-hidden />}
            </div>
            <div className={styles.stageBody}>
              <h4 className={styles.stageTitle}>{step.title}</h4>
              <code className={styles.stageValue}>{step.value}</code>
              <p className={styles.stageNote}>{step.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
