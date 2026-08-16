/**
 * Expected × actual, all nine cells.
 *
 * A confusion matrix is a heatmap, so: one hue, light to dark by magnitude,
 * and never a rainbow. The diagonal is what you want; everything off it is a
 * mistake, and the two corners are not equally bad — refusing something that
 * should have been allowed is invisible to you and infuriating to the person
 * it happened to, so that cell gets called out by name underneath rather
 * than left for the reader to find.
 *
 * Every cell carries its number. A heatmap where you have to eyeball a shade
 * against a legend to recover a count is a worse table.
 */

import styles from "./viz.module.css";
import { ACTION_COPY } from "./ActionBadge";

type Action = "allow" | "review" | "block";
const ORDER: Action[] = ["allow", "review", "block"];

export type Confusion = Record<Action, Record<Action, number>>;

export function ConfusionGrid({ grid }: { grid: Confusion }): JSX.Element {
  const max = Math.max(
    1,
    ...ORDER.flatMap((row) => ORDER.map((col) => grid[row][col])),
  );

  // Sequential blue, light→dark. Step 250 is the floor: anything lighter
  // starts disappearing into the card surface.
  const shade = (value: number): string => {
    if (value === 0) return "var(--viz-surface-sunk)";
    const t = value / max;
    if (t > 0.66) return "var(--viz-seq-600)";
    if (t > 0.33) return "var(--viz-seq-450)";
    return "var(--viz-seq-250)";
  };
  const ink = (value: number): string =>
    value / max > 0.66 ? "var(--viz-on-seq-strong)" : "var(--viz-text)";

  const falseRefusals = grid.allow.block + grid.review.block;
  const missed = grid.block.allow + grid.block.review;

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figCaption}>
        <strong>Every case, placed.</strong> Rows are what a human said should
        happen; columns are what moderato did. The diagonal is agreement.
      </figcaption>

      <div className="mdScroll">
        <table className={styles.confusion}>
          <thead>
            <tr>
              <td />
              <th scope="col" colSpan={3} className={styles.confusionAxis}>
                moderato decided
              </th>
            </tr>
            <tr>
              <td />
              {ORDER.map((col) => (
                <th key={col} scope="col">
                  {ACTION_COPY[col].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((row) => (
              <tr key={row}>
                <th scope="row" className={styles.confusionRowHead}>
                  {ACTION_COPY[row].short}
                </th>
                {ORDER.map((col) => {
                  const value = grid[row][col];
                  const diagonal = row === col;
                  return (
                    <td key={col} className={styles.confusionCell}>
                      <span
                        className={`${styles.cell} ${diagonal ? styles.cellDiagonal : ""}`}
                        style={{ background: shade(value), color: ink(value) }}
                        title={`${value} case(s) a human called "${row}" and moderato called "${col}"`}
                      >
                        {value}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.figFoot}>
        <strong>{falseRefusals}</strong>{" "}
        {falseRefusals === 1 ? "case was" : "cases were"} refused that should
        not have been — the expensive corner, because nobody files a ticket
        about it, they just stop posting. <strong>{missed}</strong>{" "}
        {missed === 1 ? "case" : "cases"} got through that should have been
        stopped; those are visible, reportable, and mostly waiting on the
        classifier layer.
      </p>
    </figure>
  );
}
