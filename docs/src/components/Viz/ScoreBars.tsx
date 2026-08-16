/**
 * Per-category confidence, as bars.
 *
 * Magnitude on a common baseline → bars, one hue, light-to-dark by value.
 * Every bar is directly labelled with its number, because there are at most
 * a handful and a reader here is comparing a value to a threshold, not
 * spotting a shape.
 */

import styles from "./viz.module.css";

/** Ordinal steps of the sequential blue ramp, lightest first. Nothing
 *  lighter than step 250 on the light surface — below that the bar starts
 *  disappearing into the card. */
const RAMP = ["var(--viz-seq-250)", "var(--viz-seq-450)", "var(--viz-seq-600)"];

const stepFor = (value: number): string =>
  value >= 0.9 ? RAMP[2] : value >= 0.7 ? RAMP[1] : RAMP[0];

export function ScoreBars({
  categories,
  score,
  rule,
}: {
  categories: string[];
  score: number;
  rule?: string;
}): JSX.Element {
  return (
    <div className={styles.bars}>
      <div className={styles.barsHead}>
        <span>Categories that tripped</span>
        {rule ? <span className={styles.rulePill}>rule: {rule}</span> : null}
      </div>
      <ul className={styles.barList}>
        {categories.map((category, index) => {
          // Only the worst category's exact score is reported by the
          // verdict; the rest are known to have tripped but not by how
          // much. Showing a fake number for them would be worse than
          // showing the honest one once.
          const value = index === 0 ? score : null;
          return (
            <li key={category} className={styles.barRow}>
              <span className={styles.barLabel}>{category}</span>
              <span className={styles.barTrack}>
                <span
                  className={styles.barFill}
                  style={{
                    width: `${(value ?? 0.35) * 100}%`,
                    background: value === null ? "var(--viz-grid)" : stepFor(value),
                  }}
                />
              </span>
              <span className={styles.barValue}>
                {value === null ? "flagged" : value.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
