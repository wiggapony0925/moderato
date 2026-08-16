/**
 * The hero animation: a message being screened, in a loop.
 *
 * It types a line, screens it, and either blurs it out under a drawn-on red
 * ban mark or clears it with a tick. The ALLOW case in the rotation is the
 * important one — an all-red demo would advertise a blunt instrument, and
 * the entire argument of this library is that most content is fine and the
 * interesting question is what happens to the rest.
 *
 * **Why the strings are already masked.** The words in `CASES` are written
 * with asterisks rather than blurred at render time. A CSS blur is a visual
 * effect: the real word would still sit in the page source, in the
 * accessibility tree, in a text selection, and in whatever indexes the page.
 * Blur on top of an already-masked string is decoration; blur as the only
 * censorship is a slur in your HTML. The examples are `aria-hidden` for the
 * same reason, with a plain-language description alongside for screen
 * readers.
 */

import { useEffect, useRef, useState } from "react";
import styles from "./blocked.module.css";

type Outcome = "block" | "review" | "allow";

interface Case {
  text: string;
  outcome: Outcome;
  category: string;
  score: number;
  note: string;
}

const CASES: Case[] = [
  {
    text: "you absolute f***ing waste of space",
    outcome: "block",
    category: "harassment",
    score: 0.96,
    note: "Refused. Nothing is written.",
  },
  {
    text: "go back where you came from, you f*****t",
    outcome: "block",
    category: "hate",
    score: 0.99,
    note: "Refused. Nothing is written.",
  },
  {
    text: "I grew up in Scunthorpe",
    outcome: "allow",
    category: "clean",
    score: 0.01,
    note: "Published, silently.",
  },
  {
    text: "this update is a complete sh*tshow",
    outcome: "review",
    category: "profanity",
    score: 0.72,
    note: "Published, and queued.",
  },
];

type Phase = "typing" | "screening" | "settled";

const TYPE_MS = 34;
const SCREEN_MS = 620;
const HOLD_MS = 2600;

export function BlockedDemo(): JSX.Element {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(CASES[0].text);
  const [phase, setPhase] = useState<Phase>("settled");
  const timers = useRef<number[]>([]);

  const current = CASES[index];

  useEffect(() => {
    // Static end-state for anyone who has asked not to be animated. The
    // reduced-motion rule elsewhere kills the transitions; without this the
    // loop would still churn state behind them.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setTyped(current.text);
      setPhase("settled");
      return;
    }

    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    clear();

    setPhase("typing");
    setTyped("");

    // `current.text.length`, not `[...current.text]`. This site's bundler
    // transpiles spread in loose mode — `[...str]` becomes `[].concat(str)`,
    // an array of ONE element — which is the identical failure that was
    // silently disabling category matching in the library itself. Same
    // lesson twice: never spread a non-array where a transpiler can see it.
    const length = current.text.length;
    for (let i = 0; i < length; i++) {
      timers.current.push(
        window.setTimeout(() => setTyped(current.text.slice(0, i + 1)), i * TYPE_MS),
      );
    }

    const typingDone = length * TYPE_MS;
    timers.current.push(window.setTimeout(() => setPhase("screening"), typingDone + 260));
    timers.current.push(
      window.setTimeout(() => setPhase("settled"), typingDone + 260 + SCREEN_MS),
    );
    timers.current.push(
      window.setTimeout(
        () => setIndex((i) => (i + 1) % CASES.length),
        typingDone + 260 + SCREEN_MS + HOLD_MS,
      ),
    );

    return clear;
  }, [current]);

  const settled = phase === "settled";
  const censored = settled && current.outcome !== "allow";

  return (
    <div className={styles.stage}>
      <div className={styles.glow} data-outcome={settled ? current.outcome : "idle"} />

      <figure className={styles.card} data-phase={phase} data-outcome={current.outcome}>
        <figcaption className={styles.srOnly}>
          A looping demonstration: an example message is screened and then
          allowed, queued for review, or refused. The refused examples are
          masked and blurred.
        </figcaption>

        <div className={styles.cardHead}>
          <span className={styles.dots} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.cardLabel}>Post a comment</span>
        </div>

        <div className={styles.field}>
          <p
            className={`${styles.text} ${censored ? styles.textCensored : ""}`}
            aria-hidden
          >
            {typed}
            {phase === "typing" && <span className={styles.caret} />}
          </p>

          {/* The ban mark. Drawn on with a stroke-dash sweep, then stamped
              down — big, red, and impossible to miss, which is the point. */}
          {censored && current.outcome === "block" && (
            <svg
              className={styles.ban}
              viewBox="0 0 100 100"
              aria-hidden
              focusable="false"
            >
              <circle className={styles.banRing} cx="50" cy="50" r="42" />
              <line className={styles.banSlash} x1="21" y1="79" x2="79" y2="21" />
            </svg>
          )}
        </div>

        <div className={styles.verdictRow}>
          {phase === "screening" ? (
            <span className={styles.screening}>
              <span className={styles.spinner} aria-hidden />
              Screening…
            </span>
          ) : settled ? (
            <>
              <span
                className={`${styles.pill} ${styles[`pill_${current.outcome}`]}`}
              >
                <span className={styles.pillIcon} aria-hidden>
                  {current.outcome === "allow" ? "✓" : current.outcome === "review" ? "!" : "✕"}
                </span>
                {current.outcome === "allow"
                  ? "Allow"
                  : current.outcome === "review"
                    ? "Review"
                    : "Block"}
              </span>
              <span className={styles.verdictNote}>{current.note}</span>
              <code className={styles.verdictScore}>
                {current.category} {current.score.toFixed(2)}
              </code>
            </>
          ) : (
            <span className={styles.idle}>&nbsp;</span>
          )}
        </div>
      </figure>

      <ol className={styles.ticks} aria-hidden>
        {CASES.map((item, i) => (
          <li
            key={item.text}
            className={i === index ? styles.tickOn : styles.tick}
            data-outcome={item.outcome}
          />
        ))}
      </ol>
    </div>
  );
}
