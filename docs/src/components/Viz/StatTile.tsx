/**
 * A single number with its name and its meaning.
 *
 * Deliberately not a chart: one value over no dimension has no shape to
 * show, and a gauge or a lone bar would add ink without adding information.
 * The caption is doing the real work — "94%" means nothing until you know
 * 94% of what, and whether up is good.
 */

import styles from "./viz.module.css";

export function StatTile({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "good" | "warning" | "critical";
}): JSX.Element {
  return (
    <div className={`${styles.tile} ${styles[`tile_${tone}`]}`}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileCaption}>{caption}</span>
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className={styles.tileRow}>{children}</div>;
}
