/**
 * Which evasion techniques survive.
 *
 * A status encoding, not a magnitude one: each row is a technique and the
 * question is binary-ish — do we handle it? So status colour plus an icon
 * plus the words "caught" or "missed", never colour alone. The fraction is
 * shown because "1 of 1" and "4 of 4" are different amounts of evidence and
 * a bare tick would hide that.
 */

import styles from "./viz.module.css";

export interface EvasionRow {
  tag: string;
  label: string;
  example: string;
  total: number;
  caught: number;
  rate: number | null;
}

export function EvasionMatrix({ rows }: { rows: EvasionRow[] }): JSX.Element {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figCaption}>
        <strong>Evasion, technique by technique.</strong> Every row is a real
        way people get around a filter, measured against the corpus cases
        tagged with it.
      </figcaption>

      <div className="mdScroll">
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">Technique</th>
              <th scope="col">Looks like</th>
              <th scope="col">Handled</th>
              <th scope="col">Cases</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tone =
                row.rate === 1 ? "good" : row.rate && row.rate >= 0.5 ? "warning" : "critical";
              return (
                <tr key={row.tag}>
                  <th scope="row" className={styles.matrixName}>
                    {row.label}
                  </th>
                  <td className={styles.matrixExample}>
                    <code>{row.example}</code>
                  </td>
                  <td>
                    <span className={`${styles.chip} ${styles[`chip_${tone}`]}`}>
                      <span aria-hidden className={styles.chipIcon}>
                        {tone === "good" ? "✓" : tone === "warning" ? "!" : "✕"}
                      </span>
                      {tone === "good" ? "Caught" : tone === "warning" ? "Partly" : "Missed"}
                    </span>
                  </td>
                  <td className={styles.matrixCount}>
                    {row.caught} of {row.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.figFoot}>
        The bottom rows are honest gaps, not oversights. No amount of
        tokenising finds hate speech that contains no listed word, and the
        English wordlist was never going to read Japanese — those are the
        classifier's job, and the reason the offline layer is a{" "}
        <em>first</em> layer.
      </p>
    </figure>
  );
}
