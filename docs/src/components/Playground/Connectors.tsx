/**
 * Lines between the panels, redrawn as you drag.
 *
 * The board is a pipeline — what you type, what it decided, what you have
 * labelled — and once the panels can move, that order stops being obvious
 * from position alone. The connectors keep it obvious. They also make the
 * dragging feel like it is doing something to a system rather than shuffling
 * three unrelated cards.
 *
 * Measured from the DOM on every frame while a pointer is down, and on
 * resize. That sounds expensive and is not: three `getBoundingClientRect`
 * calls per frame, only while something is actually moving.
 */

import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

interface Link {
  from: string;
  to: string;
}

interface Edge {
  key: string;
  d: string;
  midX: number;
  midY: number;
}

export function Connectors({
  boardRef,
  links,
  active,
}: {
  boardRef: React.RefObject<HTMLDivElement | null>;
  links: Link[];
  active: boolean;
}): JSX.Element | null {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const measure = () => {
      const bounds = board.getBoundingClientRect();
      setBox({ width: bounds.width, height: bounds.height });

      const next: Edge[] = [];
      for (const link of links) {
        const a = board.querySelector<HTMLElement>(`[data-panel="${link.from}"]`);
        const b = board.querySelector<HTMLElement>(`[data-panel="${link.to}"]`);
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();

        // Leave from whichever side faces the target, so the line never
        // crosses back over the panel it came from.
        const leftToRight = ra.left + ra.width / 2 <= rb.left + rb.width / 2;
        const x1 = (leftToRight ? ra.right : ra.left) - bounds.left;
        const y1 = ra.top + Math.min(ra.height / 2, 46) - bounds.top;
        const x2 = (leftToRight ? rb.left : rb.right) - bounds.left;
        const y2 = rb.top + Math.min(rb.height / 2, 46) - bounds.top;

        // A cubic with horizontal control points: reads as a connection
        // rather than an arrow, and stays smooth at any angle.
        const bend = Math.max(28, Math.abs(x2 - x1) * 0.45);
        const c1 = leftToRight ? x1 + bend : x1 - bend;
        const c2 = leftToRight ? x2 - bend : x2 + bend;
        next.push({
          key: `${link.from}-${link.to}`,
          d: `M${x1} ${y1} C${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`,
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
        });
      }
      setEdges(next);
    };

    measure();

    const loop = () => {
      measure();
      frame.current = requestAnimationFrame(loop);
    };
    if (active) frame.current = requestAnimationFrame(loop);

    const observer = new ResizeObserver(measure);
    observer.observe(board);
    window.addEventListener("resize", measure);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, boardRef, links]);

  if (edges.length === 0 || box.width === 0) return null;

  return (
    <svg
      className={styles.wires}
      width={box.width}
      height={box.height}
      viewBox={`0 0 ${box.width} ${box.height}`}
      aria-hidden
      focusable="false"
    >
      {edges.map((edge) => (
        <g key={edge.key}>
          <path className={styles.wire} d={edge.d} />
          {/* A dot travelling the wire, so the direction of flow is visible
              without an arrowhead cluttering the join. */}
          <circle className={styles.wireDot} r={3}>
            <animateMotion dur="2.4s" repeatCount="indefinite" path={edge.d} />
          </circle>
        </g>
      ))}
    </svg>
  );
}
