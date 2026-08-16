/**
 * Precision and recall against the block threshold.
 *
 * Two series over a continuous x — a line chart, one y-axis (both series
 * are the same measure: a rate from 0 to 1, so they belong on one scale;
 * a second axis here would be the classic lie). Legend plus direct
 * end-labels, so identity is never colour-alone. Crosshair and tooltip on
 * hover, because an HTML chart that cannot be interrogated is a picture.
 *
 * The marker line is the *decision*: drag the slider and you are choosing
 * where your product sits on this trade-off. That is the whole point of
 * plotting it — the number in the config file is not obviously 0.92 until
 * you can see what 0.80 and 0.98 would cost you.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import styles from "./viz.module.css";

export interface SweepPoint {
  threshold: number;
  precision: number;
  recall: number;
  queueRate: number;
  blockRate: number;
  autoHandled: number;
}

const W = 720;
const H = 300;
const PAD = { top: 18, right: 92, bottom: 40, left: 46 };

const SERIES = [
  { key: "precision", label: "Precision", color: "var(--viz-series-1)" },
  { key: "recall", label: "Recall", color: "var(--viz-series-2)" },
] as const;

export function SweepChart({
  sweep,
  threshold,
  onThreshold,
}: {
  sweep: SweepPoint[];
  threshold: number;
  onThreshold?: (next: number) => void;
}): JSX.Element {
  const titleId = useId();
  const [hover, setHover] = useState<SweepPoint | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const xs = useMemo(() => sweep.map((p) => p.threshold), [sweep]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);

  const x = useCallback(
    (t: number) =>
      PAD.left + ((t - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right),
    [xMax, xMin],
  );
  const y = useCallback((v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom), []);

  const path = (key: "precision" | "recall") =>
    sweep.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.threshold)} ${y(p[key])}`).join(" ");

  /** The same line, closed to the baseline. A very light fill under a rate
   *  curve makes the shape readable at a glance without competing with the
   *  2px stroke that carries the actual value. */
  const area = (key: "precision" | "recall") =>
    `${path(key)} L${x(sweep[sweep.length - 1].threshold)} ${y(0)} L${x(sweep[0].threshold)} ${y(0)} Z`;

  const nearest = useCallback(
    (clientX: number): SweepPoint | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      let best: SweepPoint | null = null;
      let bestGap = Infinity;
      for (const point of sweep) {
        const gap = Math.abs(x(point.threshold) - px);
        if (gap < bestGap) {
          bestGap = gap;
          best = point;
        }
      }
      return best;
    },
    [sweep, x],
  );

  const active = hover ?? sweep.reduce((closest, p) =>
    Math.abs(p.threshold - threshold) < Math.abs(closest.threshold - threshold) ? p : closest,
  sweep[0]);

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = sweep.filter((_, i) => i % 5 === 0).map((p) => p.threshold);

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.figCaption} id={titleId}>
        <strong>Precision and recall vs. the block threshold.</strong> Higher
        threshold = refuse less, queue more. Every point is the whole corpus
        re-scored.
      </figcaption>

      <div className={`mdScroll ${styles.plot}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className={styles.svg}
          role="img"
          aria-labelledby={titleId}
          onMouseMove={(e) => setHover(nearest(e.clientX))}
          onMouseLeave={() => setHover(null)}
        >
          {/* recessive grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={styles.axis}>
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - PAD.bottom + 20} textAnchor="middle" className={styles.axis}>
              {t.toFixed(2)}
            </text>
          ))}
          <text
            x={(PAD.left + (W - PAD.right)) / 2}
            y={H - 6}
            textAnchor="middle"
            className={styles.axisTitle}
          >
            blockScore threshold
          </text>

          {/* the chosen threshold */}
          <line
            x1={x(active.threshold)}
            x2={x(active.threshold)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--viz-text-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {SERIES.map((s) => (
            <path
              key={`${s.key}-area`}
              d={area(s.key)}
              fill={s.color}
              opacity={0.07}
              stroke="none"
            />
          ))}

          {SERIES.map((s) => (
            <path
              key={s.key}
              d={path(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* markers on the active point — 2px surface ring so overlapping
              dots stay two dots */}
          {SERIES.map((s) => (
            <circle
              key={s.key}
              cx={x(active.threshold)}
              cy={y(active[s.key])}
              r={5}
              fill={s.color}
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          ))}

          {/* direct labels at the line ends — identity without the legend */}
          {SERIES.map((s) => (
            <text
              key={s.key}
              x={W - PAD.right + 10}
              y={y(sweep[sweep.length - 1][s.key]) + 4}
              className={styles.endLabel}
            >
              {s.label}
            </text>
          ))}
        </svg>
        {hover && (
          <div
            className={styles.tooltip}
            style={{
              left: `${(x(hover.threshold) / W) * 100}%`,
              transform:
                x(hover.threshold) > W * 0.62
                  ? "translate(-105%, 0)"
                  : "translate(5%, 0)",
            }}
          >
            <span className={styles.tooltipHead}>
              blockScore {hover.threshold.toFixed(2)}
            </span>
            {SERIES.map((s) => (
              <span key={s.key} className={styles.tooltipRow}>
                <span className={styles.swatch} style={{ background: s.color }} aria-hidden />
                {s.label}
                <b>{pct(hover[s.key])}</b>
              </span>
            ))}
            <span className={styles.tooltipRow}>
              <span className={styles.swatchGhost} aria-hidden />
              Queued
              <b>{pct(hover.queueRate)}</b>
            </span>
          </div>
        )}
      </div>

      <div className={styles.legend}>
        {SERIES.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
        <span className={styles.legendReadout}>
          at {active.threshold.toFixed(2)} · precision {pct(active.precision)} · recall{" "}
          {pct(active.recall)}
        </span>
      </div>

      {onThreshold ? (
        <div className={styles.sliderRow}>
          <label className={styles.sliderLabel} htmlFor="threshold-slider">
            blockScore
          </label>
          <input
            id="threshold-slider"
            type="range"
            min={xMin}
            max={xMax}
            step={0.02}
            value={threshold}
            className={styles.slider}
            onChange={(e) => onThreshold(Number(e.target.value))}
          />
          <output className={styles.sliderValue}>{threshold.toFixed(2)}</output>
        </div>
      ) : null}
    </figure>
  );
}

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
