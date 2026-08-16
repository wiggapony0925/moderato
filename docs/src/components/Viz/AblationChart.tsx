/**
 * What each defence is actually worth.
 *
 * Two measures over the same ordered configurations. Grouped bars rather
 * than a line, because the x axis is a set of named build-ups, not a
 * continuum — you cannot be halfway between "naive" and "normalised".
 *
 * Both series are rates on 0–1, so they share one axis. Every bar is
 * directly labelled: there are six of them and the reader is comparing
 * values to each other, not reading a shape.
 */

import styles from "./viz.module.css";

export interface AblationRow {
  key: string;
  label: string;
  detail: string;
  recall: number;
  precision: number;
  accuracy: number;
}

const SERIES = [
  { key: "recall", label: "Recall", color: "var(--viz-series-2)" },
  { key: "precision", label: "Precision", color: "var(--viz-series-1)" },
] as const;

export function AblationChart({ rows }: { rows: AblationRow[] }): JSX.Element {
  const best = rows[rows.length - 1];
  const first = rows[0];
  const gain = best && first ? best.recall - first.recall : 0;

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figCaption}>
        <strong>What each layer buys.</strong> The same corpus, the same
        policy, three matchers. The naive row is not a straw man — it is the
        twenty lines almost every team writes first.
      </figcaption>

      <div className={styles.ablation}>
        {rows.map((row) => (
          <div key={row.key} className={styles.ablationRow}>
            <div className={styles.ablationHead}>
              <span className={styles.ablationLabel}>{row.label}</span>
              <span className={styles.ablationDetail}>{row.detail}</span>
            </div>
            <div className={styles.ablationBars}>
              {SERIES.map((series) => (
                <div key={series.key} className={styles.ablationBar}>
                  <span className={styles.ablationBarLabel}>{series.label}</span>
                  <span className={styles.ablationTrack}>
                    <span
                      className={styles.ablationFill}
                      style={{
                        width: `${row[series.key] * 100}%`,
                        background: series.color,
                      }}
                    />
                  </span>
                  <span className={styles.ablationValue}>
                    {(row[series.key] * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className={styles.figFoot}>
        Normalisation and the fused scan together add{" "}
        <strong>{Math.round(gain * 100)} points of recall</strong> and cost{" "}
        <strong>
          {Math.round((first.precision - best.precision) * 100) === 0
            ? "nothing"
            : `${Math.round((first.precision - best.precision) * 100)} points`}
        </strong>{" "}
        of precision. That is the whole argument for doing the boring
        tokenisation work properly.
      </p>
    </figure>
  );
}
