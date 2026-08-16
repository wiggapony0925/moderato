/**
 * Where the corpus lands: allow / review / block as one stacked bar.
 *
 * A part-to-whole of three parts that always sums to 100% — one stacked bar
 * beats three pies and beats three separate bars, because the comparison
 * the reader wants is "how much of the total is queue work". 2px surface
 * gaps between segments so the boundaries read without borders, and each
 * segment carries an icon + label so status is never colour alone.
 */

import { ACTION_COPY } from "./ActionBadge";
import styles from "./viz.module.css";

export interface Counts {
  allow: number;
  review: number;
  block: number;
}

const ORDER = [
  { key: "allow", color: "var(--viz-good)" },
  { key: "review", color: "var(--viz-warning)" },
  { key: "block", color: "var(--viz-critical)" },
] as const;

export function OutcomeBar({ counts, total }: { counts: Counts; total: number }): JSX.Element {
  const safeTotal = total || 1;
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figCaption}>
        <strong>What happens to the corpus at this threshold.</strong> The middle
        band is the only part a human has to read.
      </figcaption>
      <div
        className={styles.stack}
        role="img"
        aria-label={ORDER.map(
          (s) => `${ACTION_COPY[s.key].short} ${counts[s.key]} of ${total}`,
        ).join(", ")}
      >
        {ORDER.map((segment) => {
          const value = counts[segment.key];
          if (value === 0) return null;
          return (
            <span
              key={segment.key}
              className={styles.stackSegment}
              style={{
                width: `${(value / safeTotal) * 100}%`,
                background: segment.color,
              }}
            />
          );
        })}
      </div>
      <ul className={styles.stackLegend}>
        {ORDER.map((segment) => (
          <li key={segment.key} className={styles.stackLegendItem}>
            <span className={styles.swatch} style={{ background: segment.color }} aria-hidden />
            <span aria-hidden className={styles.stackIcon}>
              {ACTION_COPY[segment.key].icon}
            </span>
            <strong>{ACTION_COPY[segment.key].short}</strong>
            <span className={styles.stackCount}>
              {counts[segment.key]} · {Math.round((counts[segment.key] / safeTotal) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
