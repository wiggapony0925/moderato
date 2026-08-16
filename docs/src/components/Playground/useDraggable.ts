/**
 * Drag-to-reposition on a snapping grid, persisted.
 *
 * Pointer events rather than HTML5 drag-and-drop: `dragstart`/`drop` is for
 * moving *data* between drop targets and drags a ghost image you cannot
 * style, has no touch support worth the name, and fires nothing useful
 * during the drag. Pointer events are one API for mouse, pen and touch, and
 * they give you `setPointerCapture`, which is what stops a fast drag from
 * escaping the element and stranding it mid-move.
 *
 * Positions snap to the grid and are written to localStorage, so where you
 * left a card is where it is when you come back.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Point {
  x: number;
  y: number;
}

export const GRID = 24;

const KEY = "moderato.playground.layout.v1";

const snap = (n: number): number => Math.round(n / GRID) * GRID;

type Layout = Record<string, Point>;

const readLayout = (): Layout => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Layout) : {};
  } catch {
    return {};
  }
};

const writeLayout = (layout: Layout): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* private mode — the drag still works, it just is not remembered */
  }
};

export function clearLayout(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export interface Draggable {
  /** Spread onto the element that should move. */
  panelProps: {
    ref: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
    "data-dragging": boolean | undefined;
  };
  /** Spread onto the grab handle inside it. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    role: "button";
    tabIndex: 0;
    "aria-label": string;
  };
  dragging: boolean;
  moved: boolean;
  reset: () => void;
}

export function useDraggable(id: string, label: string): Draggable {
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const node = useRef<HTMLElement | null>(null);
  const origin = useRef<{ pointer: Point; start: Point } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read the saved position after mount. Doing it in the initial state would
  // make the server-rendered HTML and the first client render disagree.
  useEffect(() => {
    const saved = readLayout()[id];
    if (saved) setOffset(saved);
    setHydrated(true);
  }, [id]);

  const persist = useCallback(
    (next: Point) => {
      const layout = readLayout();
      if (next.x === 0 && next.y === 0) delete layout[id];
      else layout[id] = next;
      writeLayout(layout);
    },
    [id],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Left button / primary touch only, and never on something interactive
      // that happens to live inside the handle.
      if (event.button !== 0) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      origin.current = {
        pointer: { x: event.clientX, y: event.clientY },
        start: offset,
      };
      setDragging(true);
    },
    [offset],
  );

  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => {
      const from = origin.current;
      if (!from) return;
      setOffset({
        x: snap(from.start.x + event.clientX - from.pointer.x),
        y: snap(from.start.y + event.clientY - from.pointer.y),
      });
    };
    const end = () => {
      setDragging(false);
      origin.current = null;
      setOffset((current) => {
        persist(current);
        return current;
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging, persist]);

  /** Arrow keys move it too. A drag handle that only works with a mouse is
   *  a feature half your users cannot reach. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? GRID * 4 : GRID;
      const delta: Record<string, Point> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const d = delta[event.key];
      if (d) {
        event.preventDefault();
        setOffset((current) => {
          const next = { x: current.x + d.x, y: current.y + d.y };
          persist(next);
          return next;
        });
        return;
      }
      if (event.key === "Escape" || event.key === "Home") {
        event.preventDefault();
        setOffset({ x: 0, y: 0 });
        persist({ x: 0, y: 0 });
      }
    },
    [persist],
  );

  const reset = useCallback(() => {
    setOffset({ x: 0, y: 0 });
    persist({ x: 0, y: 0 });
  }, [persist]);

  const moved = hydrated && (offset.x !== 0 || offset.y !== 0);

  return {
    panelProps: {
      ref: (n) => {
        node.current = n;
      },
      style: {
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        // No transition while dragging, or the card lags the pointer.
        transition: dragging ? "none" : "transform 0.18s cubic-bezier(0.2,0.8,0.3,1)",
        zIndex: dragging ? 20 : undefined,
      },
      "data-dragging": dragging || undefined,
    },
    handleProps: {
      onPointerDown,
      onKeyDown,
      role: "button",
      tabIndex: 0,
      "aria-label": `Move ${label}. Arrow keys to nudge, Escape to snap back.`,
    },
    dragging,
    moved,
    reset,
  };
}
